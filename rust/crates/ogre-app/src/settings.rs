//! What the teacher has chosen, kept between runs.

use ogre_llm::{ProviderConfig, ProviderKind};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// The key under which [`Settings`] is stored.
pub const STORAGE_KEY: &str = "settings";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub provider: ProviderSettings,
    /// Use the dark palette.
    pub dark: bool,
    /// How the rubric is read when grading, from 0 (most lenient) to 100
    /// (most strict). See [`engine_leniency`] for what each setting does.
    pub leniency: u8,
    /// Work each score out from the verdicts in the feedback instead of
    /// taking the AI's own score. Off unless the teacher turns it on.
    pub score_from_verdicts: bool,
    /// The agent's skills the teacher has switched on or off, by id.
    pub skills: BTreeMap<String, bool>,
    /// Run Chrome without a window of its own and show its page inside
    /// OGRE's, on the Browser screen. An experiment: off unless asked for.
    pub page_inside: bool,
    /// Propose a zero for students with no response and no grade. Off
    /// unless the teacher turns it on.
    pub zero_for_no_response: bool,
    /// AI services that were set up and are not the one in use, each as it
    /// was left, to switch back to. Their keys are in the keyring.
    pub other_services: Vec<ProviderSettings>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            provider: ProviderSettings::default(),
            dark: false,
            leniency: DEFAULT_LENIENCY,
            score_from_verdicts: false,
            skills: BTreeMap::new(),
            page_inside: false,
            zero_for_no_response: false,
            other_services: Vec::new(),
        }
    }
}

impl Settings {
    /// Makes `service` the one in use. The one that was in use is kept as it
    /// was left, and `service` comes back as it was last set up, or blank if
    /// it never was.
    pub fn switch_service(&mut self, service: Service) {
        if service == self.provider.service {
            return;
        }
        let returning = match self
            .other_services
            .iter()
            .position(|other| other.service == service)
        {
            Some(at) => self.other_services.remove(at),
            None => ProviderSettings {
                service,
                ..ProviderSettings::default()
            },
        };
        let left = std::mem::replace(&mut self.provider, returning);
        // A service nothing was entered for is not one to switch back to.
        if !left.model.trim().is_empty() || !left.base_url.trim().is_empty() {
            self.other_services.push(left);
        }
    }

    /// The services that have a model chosen: the one in use first, if it
    /// has, then the others in the order they were left.
    pub fn services_set_up(&self) -> impl Iterator<Item = &ProviderSettings> {
        std::iter::once(&self.provider)
            .chain(&self.other_services)
            .filter(|provider| !provider.model.trim().is_empty())
    }
}

/// The AI service the Electron app was set up with, for a teacher moving
/// over from it. The key is theirs; it is only ever handed to the key store.
pub struct OldAppProvider {
    pub provider: ProviderSettings,
    pub api_key: Option<String>,
}

/// Where the Electron app keeps its settings, if it has been used here.
pub fn old_app_settings_file() -> Option<std::path::PathBuf> {
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| Some(std::path::PathBuf::from(std::env::var_os("HOME")?).join(".config")))?;
    let file = config.join("ogre-desktop").join("ogre-server.json");
    file.is_file().then_some(file)
}

/// Reads the Electron app's active AI service from its settings text. `None`
/// unless it is an Ollama service, the only kind that app's file is known to
/// describe.
pub fn old_app_provider(settings_json: &str) -> Option<OldAppProvider> {
    let settings: serde_json::Value = serde_json::from_str(settings_json).ok()?;
    let active = settings["providers"]
        .as_array()?
        .iter()
        .find(|provider| provider["is_active"] == true)?;
    if active["id"] != "ollama" {
        return None;
    }
    let address = active["api_url"].as_str().unwrap_or_default().trim();
    let model = active["model"].as_str()?.trim();
    let key = active["credentials"]["api_key"]
        .as_str()
        .map(str::trim)
        .filter(|key| !key.is_empty());
    // The same app talks to Ollama on this computer or to Ollama's own
    // service, told apart by the address.
    let cloud = address.contains("ollama.com");
    let service = if cloud {
        Service::OllamaCloud
    } else {
        Service::Ollama
    };
    let usual = service.kind().default_base_url();
    Some(OldAppProvider {
        provider: ProviderSettings {
            service,
            base_url: if address.trim_end_matches('/') == usual.trim_end_matches('/') {
                String::new()
            } else {
                address.to_owned()
            },
            model: model.to_owned(),
        },
        api_key: key.filter(|_| cloud).map(str::to_owned),
    })
}

/// The leniency a new teacher starts with. It grades as the Electron app did
/// at its most lenient, which is how its teacher had it set.
pub const DEFAULT_LENIENCY: u8 = 50;

/// The setting at which the rubric is used as written.
pub const AS_WRITTEN_LENIENCY: u8 = 75;

/// The app's leniency setting on the grading engine's scale, which is the
/// Electron app's: 0 its most lenient, 50 the rubric as written, 100 most
/// strict, below 0 more lenient still.
///
/// | Setting | Engine | The AI rewords the rubric to be |
/// |---|---|---|
/// | 0 | -50 | 100% more lenient |
/// | 50 | 0 | 50% more lenient (the Electron app's most lenient) |
/// | 75 | 50 | nothing: used as written |
/// | 100 | 100 | 50% more strict |
pub fn engine_leniency(setting: u8) -> i16 {
    let setting = i16::from(setting.min(100));
    let default = i16::from(DEFAULT_LENIENCY);
    if setting <= default {
        setting - default
    } else {
        (setting - default) * 2
    }
}

/// Which AI service grades, and with which model. The API key is not part of
/// this: it lives in the operating system's keyring.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProviderSettings {
    pub service: Service,
    /// Blank means the service's usual address.
    pub base_url: String,
    pub model: String,
}

impl Default for ProviderSettings {
    fn default() -> Self {
        Self {
            service: Service::Ollama,
            base_url: String::new(),
            model: String::new(),
        }
    }
}

impl ProviderSettings {
    /// The address requests go to.
    pub fn effective_base_url(&self) -> &str {
        match self.base_url.trim() {
            "" => self.service.kind().default_base_url(),
            url => url,
        }
    }

    pub fn to_config(&self, api_key: Option<&str>) -> ProviderConfig {
        let mut config = ProviderConfig::new(self.service.kind(), self.model.trim())
            .with_base_url(self.effective_base_url());
        if let Some(key) = api_key.filter(|key| !key.trim().is_empty()) {
            config = config.with_api_key(key.trim());
        }
        config
    }

    /// Why grading cannot start with these settings, if it cannot.
    pub fn problem(&self, has_api_key: bool) -> Option<&'static str> {
        if self.model.trim().is_empty() {
            Some("Choose a model in Settings first.")
        } else if self.service.needs_key() && !has_api_key {
            Some("Enter an API key in Settings first.")
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Service {
    Ollama,
    OllamaCloud,
    OpenAi,
    Anthropic,
    Gemini,
}

impl Service {
    pub const ALL: [Self; 5] = [
        Self::Ollama,
        Self::OllamaCloud,
        Self::OpenAi,
        Self::Anthropic,
        Self::Gemini,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Ollama => "Ollama on this computer",
            Self::OllamaCloud => "Ollama Cloud",
            Self::OpenAi => "OpenAI or compatible",
            Self::Anthropic => "Anthropic",
            Self::Gemini => "Google Gemini",
        }
    }

    pub fn kind(self) -> ProviderKind {
        match self {
            Self::Ollama => ProviderKind::Ollama,
            Self::OllamaCloud => ProviderKind::OllamaCloud,
            Self::OpenAi => ProviderKind::OpenAi,
            Self::Anthropic => ProviderKind::Anthropic,
            Self::Gemini => ProviderKind::Gemini,
        }
    }

    /// Student work leaves this computer with every service except local Ollama.
    pub fn is_remote(self) -> bool {
        self != Self::Ollama
    }

    pub fn needs_key(self) -> bool {
        self != Self::Ollama
    }

    /// The name the key is stored under in the keyring.
    pub fn key_name(self) -> &'static str {
        self.kind().id()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_blank_address_means_the_usual_one() {
        let mut provider = ProviderSettings::default();
        assert_eq!(provider.effective_base_url(), "http://localhost:11434");
        provider.base_url = "  http://gpu-box:11434 ".into();
        assert_eq!(provider.effective_base_url(), "http://gpu-box:11434");
    }

    #[test]
    fn grading_needs_a_model_and_remote_services_need_a_key() {
        let mut provider = ProviderSettings::default();
        assert_eq!(
            provider.problem(false),
            Some("Choose a model in Settings first.")
        );
        provider.model = "gemma4:31b".into();
        assert_eq!(provider.problem(false), None);
        provider.service = Service::Anthropic;
        assert_eq!(
            provider.problem(false),
            Some("Enter an API key in Settings first.")
        );
        assert_eq!(provider.problem(true), None);
    }

    #[test]
    fn the_key_is_passed_to_the_config_but_never_shown() {
        let provider = ProviderSettings {
            service: Service::OpenAi,
            base_url: String::new(),
            model: " gpt-test ".into(),
        };
        let config = provider.to_config(Some(" sk-secret "));
        assert_eq!(config.model, "gpt-test");
        assert_eq!(config.api_key.as_deref(), Some("sk-secret"));
        assert!(!format!("{config:?}").contains("sk-secret"));
        assert_eq!(provider.to_config(Some("  ")).api_key, None);
    }

    #[test]
    fn the_old_apps_service_is_read_from_its_settings() {
        let cloud = r#"{"token":"t","providers":[
            {"id":"ollama","api_url":"http://localhost:11434","model":"small","is_active":false},
            {"id":"ollama","api_url":"https://ollama.com","model":"gemma4:31b","is_active":true,
             "credentials":{"api_key":" secret "}}]}"#;
        let found = old_app_provider(cloud).unwrap();
        assert_eq!(found.provider.service, Service::OllamaCloud);
        assert_eq!(found.provider.model, "gemma4:31b");
        assert_eq!(
            found.provider.base_url, "",
            "the usual address is left blank"
        );
        assert_eq!(found.api_key.as_deref(), Some("secret"));

        let local = r#"{"providers":[{"id":"ollama","api_url":"http://192.168.1.5:11434",
            "model":"qwen3","is_active":true,"credentials":{"api_key":"unused"}}]}"#;
        let found = old_app_provider(local).unwrap();
        assert_eq!(found.provider.service, Service::Ollama);
        assert_eq!(found.provider.base_url, "http://192.168.1.5:11434");
        assert_eq!(found.api_key, None, "a local Ollama takes no key");
    }

    #[test]
    fn settings_of_the_old_app_that_cannot_be_used_are_left_alone() {
        for text in [
            "",
            "not json",
            "{}",
            r#"{"providers":[]}"#,
            r#"{"providers":[{"id":"ollama","api_url":"https://ollama.com","model":"m","is_active":false}]}"#,
            r#"{"providers":[{"id":"openai","api_url":"https://api.openai.com","model":"m","is_active":true}]}"#,
            r#"{"providers":[{"id":"ollama","api_url":"https://ollama.com","is_active":true}]}"#,
        ] {
            assert!(old_app_provider(text).is_none(), "{text}");
        }
    }

    #[test]
    fn the_usual_leniency_grades_as_the_electron_app_did_at_its_most_lenient() {
        assert_eq!(Settings::default().leniency, 50);
        assert_eq!(engine_leniency(50), 0);
        // The rubric as written sits three quarters of the way along.
        assert_eq!(engine_leniency(AS_WRITTEN_LENIENCY), 50);
        assert_eq!(engine_leniency(100), 100);
        // Below the usual setting the rubric is reworded further still.
        assert_eq!(engine_leniency(0), -50);
        assert_eq!(engine_leniency(25), -25);
        assert_eq!(engine_leniency(60), 20);
        // The scale never runs backwards.
        assert!((0..100u8).all(|s| engine_leniency(s) < engine_leniency(s + 1)));
        assert_eq!(engine_leniency(250), 100);
    }

    #[test]
    fn settings_survive_a_round_trip_and_tolerate_missing_fields() {
        let settings = Settings {
            provider: ProviderSettings {
                service: Service::Gemini,
                base_url: String::new(),
                model: "gemini-test".into(),
            },
            dark: true,
            leniency: 20,
            score_from_verdicts: true,
            skills: BTreeMap::from([("my-skill".to_owned(), false)]),
            page_inside: true,
            zero_for_no_response: true,
            other_services: vec![ProviderSettings {
                service: Service::Ollama,
                base_url: String::new(),
                model: "gemma4:31b".into(),
            }],
        };
        let json = serde_json::to_string(&settings).unwrap();
        assert_eq!(serde_json::from_str::<Settings>(&json).unwrap(), settings);
        assert_eq!(
            serde_json::from_str::<Settings>("{}").unwrap(),
            Settings::default()
        );
        // Settings saved before the scoring choice existed keep the AI's score.
        let older = r#"{"dark":true,"leniency":20}"#;
        assert!(
            !serde_json::from_str::<Settings>(older)
                .unwrap()
                .score_from_verdicts
        );
    }

    #[test]
    fn the_rubric_is_used_as_written_unless_the_teacher_moves_leniency() {
        assert_eq!(Settings::default().leniency, 50);
        assert_eq!(serde_json::from_str::<Settings>("{}").unwrap().leniency, 50);
    }

    #[test]
    fn switching_services_keeps_each_as_it_was_left() {
        let mut settings = Settings::default();
        settings.provider.model = "gemma4:31b".into();
        settings.switch_service(Service::OllamaCloud);
        assert_eq!(settings.provider.service, Service::OllamaCloud);
        assert_eq!(settings.provider.model, "", "never set up, so blank");
        settings.provider.model = "gemma4:31b-cloud".into();
        settings.provider.base_url = "https://ollama.example".into();

        // Back, and each is as it was left.
        settings.switch_service(Service::Ollama);
        assert_eq!(settings.provider.model, "gemma4:31b");
        assert_eq!(settings.other_services.len(), 1);
        settings.switch_service(Service::OllamaCloud);
        assert_eq!(settings.provider.model, "gemma4:31b-cloud");
        assert_eq!(settings.provider.base_url, "https://ollama.example");
        assert_eq!(settings.other_services.len(), 1);
        let set_up: Vec<Service> = settings.services_set_up().map(|p| p.service).collect();
        assert_eq!(set_up, [Service::OllamaCloud, Service::Ollama]);

        // A service looked at and left blank is not kept, and choosing the
        // one in use changes nothing.
        settings.switch_service(Service::Gemini);
        settings.switch_service(Service::Gemini);
        settings.switch_service(Service::Ollama);
        let set_up: Vec<Service> = settings.services_set_up().map(|p| p.service).collect();
        assert_eq!(set_up, [Service::Ollama, Service::OllamaCloud]);
    }
}
