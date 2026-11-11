//! What the teacher has chosen, kept between runs.

use ogre_llm::{ProviderConfig, ProviderKind};
use serde::{Deserialize, Serialize};

/// The key under which [`Settings`] is stored.
pub const STORAGE_KEY: &str = "settings";

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub provider: ProviderSettings,
    /// Use the dark palette.
    pub dark: bool,
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
    fn settings_survive_a_round_trip_and_tolerate_missing_fields() {
        let settings = Settings {
            provider: ProviderSettings {
                service: Service::Gemini,
                base_url: String::new(),
                model: "gemini-test".into(),
            },
            dark: true,
        };
        let json = serde_json::to_string(&settings).unwrap();
        assert_eq!(serde_json::from_str::<Settings>(&json).unwrap(), settings);
        assert_eq!(
            serde_json::from_str::<Settings>("{}").unwrap(),
            Settings::default()
        );
    }
}
