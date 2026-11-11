//! API keys, kept in the operating system's keyring rather than in a file.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::settings::Service;

/// Where API keys are remembered.
pub trait KeyStore {
    /// The stored key for `service`, if there is one and it can be read.
    fn load(&self, service: Service) -> Option<String>;

    /// Remembers `key` for `service`; an empty key forgets the stored one.
    ///
    /// On failure the key is simply not remembered: the caller keeps using it
    /// for this session and tells the teacher.
    fn store(&self, service: Service, key: &str) -> Result<(), String>;
}

/// The operating system's keyring.
pub struct Keyring;

const KEYRING_SERVICE: &str = "ogre";

impl KeyStore for Keyring {
    fn load(&self, service: Service) -> Option<String> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, service.key_name()).ok()?;
        entry.get_password().ok().filter(|key| !key.is_empty())
    }

    fn store(&self, service: Service, key: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, service.key_name())
            .map_err(|error| error.to_string())?;
        if key.is_empty() {
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(error) => Err(error.to_string()),
            }
        } else {
            entry.set_password(key).map_err(|error| error.to_string())
        }
    }
}

/// Keys that last only as long as the program runs. Used in tests.
#[derive(Default)]
pub struct MemoryKeys(Mutex<HashMap<Service, String>>);

impl KeyStore for MemoryKeys {
    fn load(&self, service: Service) -> Option<String> {
        self.0.lock().ok()?.get(&service).cloned()
    }

    fn store(&self, service: Service, key: &str) -> Result<(), String> {
        let mut keys = self.0.lock().map_err(|error| error.to_string())?;
        if key.is_empty() {
            keys.remove(&service);
        } else {
            keys.insert(service, key.to_owned());
        }
        Ok(())
    }
}
