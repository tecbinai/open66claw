//! Discover AI providers from the user's local configuration.
//!
//! Reads three sources (in priority order):
//! 1. Environment variables (DEEPSEEK_API_KEY, etc.)
//! 2. Config file (~/.openclawcn/openclawcn.json, JSON5 format)
//! 3. Auth profiles (~/.openclawcn/agents/main/agent/auth-profiles.json)
//!
//! API keys are kept in memory only; the frontend receives sanitized versions.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, PartialEq)]
pub enum ApiType {
    OpenAiCompat,
    AnthropicMessages,
    GoogleGemini,
}

/// A discovered AI provider with everything needed to make API calls.
/// The `api_key` field is the REAL key — never send this to the frontend.
#[derive(Debug, Clone)]
pub struct DiscoveredProvider {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub api_type: ApiType,
    pub source: String,
    pub extra_headers: HashMap<String, String>,
    pub default_model: String,
}

/// Sanitized version sent to the frontend via IPC.
#[derive(Debug, Clone, Serialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub api_type: ApiType,
    pub source: String,
    /// Masked key like "sk-abc...***"
    pub key_preview: String,
    pub default_model: String,
    /// Whether this is the user's preferred text model provider
    pub is_preferred: bool,
}

impl DiscoveredProvider {
    pub fn to_info(&self) -> ProviderInfo {
        ProviderInfo {
            id: self.id.clone(),
            name: self.name.clone(),
            api_type: self.api_type.clone(),
            source: self.source.clone(),
            key_preview: mask_key(&self.api_key),
            default_model: self.default_model.clone(),
            is_preferred: false,
        }
    }
}

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        return "***".to_string();
    }
    let prefix = &key[..6.min(key.len())];
    format!("{}...***", prefix)
}

// ── Known provider registry ──────────────────────────────────────────────────

struct KnownProvider {
    id: &'static str,
    name: &'static str,
    base_url: &'static str,
    api_type: ApiType,
    env_vars: &'static [&'static str],
    extra_headers: &'static [(&'static str, &'static str)],
    default_model: &'static str,
}

const KNOWN_PROVIDERS: &[KnownProvider] = &[
    KnownProvider {
        id: "deepseek",
        name: "DeepSeek",
        base_url: "https://api.deepseek.com",
        api_type: ApiType::OpenAiCompat,
        env_vars: &["DEEPSEEK_API_KEY"],
        extra_headers: &[],
        default_model: "deepseek-chat",
    },
    KnownProvider {
        id: "kimi-coding",
        name: "Kimi Coding",
        base_url: "https://api.kimi.com/coding/v1",
        api_type: ApiType::OpenAiCompat,
        env_vars: &["KIMI_API_KEY", "KIMICODE_API_KEY"],
        extra_headers: &[("User-Agent", "KimiCLI/1.16.0")],
        default_model: "kimi-k2",
    },
    KnownProvider {
        id: "anthropic",
        name: "Anthropic",
        base_url: "https://api.anthropic.com",
        api_type: ApiType::AnthropicMessages,
        env_vars: &["ANTHROPIC_API_KEY"],
        extra_headers: &[],
        default_model: "claude-sonnet-4-20250514",
    },
    KnownProvider {
        id: "qwen-dashscope",
        name: "通义千问 (DashScope)",
        base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_type: ApiType::OpenAiCompat,
        env_vars: &["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
        extra_headers: &[],
        default_model: "qwen-plus",
    },
    KnownProvider {
        id: "moonshot",
        name: "Moonshot AI",
        base_url: "https://api.moonshot.cn/v1",
        api_type: ApiType::OpenAiCompat,
        env_vars: &["MOONSHOT_API_KEY"],
        extra_headers: &[],
        default_model: "moonshot-v1-8k",
    },
    KnownProvider {
        id: "glm",
        name: "智谱 GLM",
        base_url: "https://open.bigmodel.cn/api/paas/v4",
        api_type: ApiType::OpenAiCompat,
        env_vars: &["ZHIPU_API_KEY", "GLM_API_KEY"],
        extra_headers: &[],
        default_model: "glm-4-flash",
    },
    KnownProvider {
        id: "doubao",
        name: "豆包 (Volcengine)",
        base_url: "https://ark.cn-beijing.volces.com/api/v3",
        api_type: ApiType::OpenAiCompat,
        env_vars: &["ARK_API_KEY", "DOUBAO_API_KEY"],
        extra_headers: &[],
        default_model: "doubao-1.5-pro-32k",
    },
    KnownProvider {
        id: "siliconflow",
        name: "SiliconFlow",
        base_url: "https://api.siliconflow.cn/v1",
        api_type: ApiType::OpenAiCompat,
        env_vars: &["SILICONFLOW_API_KEY"],
        extra_headers: &[],
        default_model: "deepseek-ai/DeepSeek-V3",
    },
    KnownProvider {
        id: "openai",
        name: "OpenAI",
        base_url: "https://api.openai.com/v1",
        api_type: ApiType::OpenAiCompat,
        env_vars: &["OPENAI_API_KEY"],
        extra_headers: &[],
        default_model: "gpt-4o-mini",
    },
    KnownProvider {
        id: "tencent-hunyuan",
        name: "腾讯混元",
        base_url: "https://api.hunyuan.cloud.tencent.com/v1",
        api_type: ApiType::OpenAiCompat,
        env_vars: &["HUNYUAN_API_KEY"],
        extra_headers: &[],
        default_model: "hunyuan-standard",
    },
    KnownProvider {
        id: "openrouter",
        name: "OpenRouter",
        base_url: "https://openrouter.ai/api/v1",
        api_type: ApiType::OpenAiCompat,
        env_vars: &["OPENROUTER_API_KEY"],
        extra_headers: &[],
        default_model: "google/gemini-flash-1.5",
    },
    KnownProvider {
        id: "google",
        name: "Google Gemini",
        base_url: "https://generativelanguage.googleapis.com/v1beta",
        api_type: ApiType::GoogleGemini,
        env_vars: &["GOOGLE_API_KEY", "GEMINI_API_KEY"],
        extra_headers: &[],
        default_model: "gemini-2.5-flash",
    },
    KnownProvider {
        id: "aliyun-codeplan",
        name: "阿里云 CodePlan",
        base_url: "https://coding.dashscope.aliyuncs.com/v1",
        api_type: ApiType::OpenAiCompat,
        env_vars: &["ALIYUN_CODEPLAN_API_KEY"],
        extra_headers: &[],
        default_model: "qwen3.5-plus",
    },
];

// ── Discovery ────────────────────────────────────────────────────────────────

fn resolve_state_dir() -> PathBuf {
    super::resolve_state_dir()
}

/// Discover all available AI providers from env vars, config file, and auth profiles.
pub fn discover_providers() -> Vec<DiscoveredProvider> {
    let mut providers: Vec<DiscoveredProvider> = Vec::new();
    let mut seen_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Source 1: Environment variables
    for kp in KNOWN_PROVIDERS {
        for env_var in kp.env_vars {
            if let Ok(key) = std::env::var(env_var) {
                let key = key.trim().to_string();
                if !key.is_empty() && seen_ids.insert(kp.id.to_string()) {
                    let mut headers = HashMap::new();
                    for (k, v) in kp.extra_headers {
                        headers.insert(k.to_string(), v.to_string());
                    }
                    providers.push(DiscoveredProvider {
                        id: kp.id.to_string(),
                        name: kp.name.to_string(),
                        base_url: kp.base_url.to_string(),
                        api_key: key,
                        api_type: kp.api_type.clone(),
                        source: format!("env:{}", env_var),
                        extra_headers: headers,
                        default_model: kp.default_model.to_string(),
                    });
                    break; // found key for this provider, skip other env vars
                }
            }
        }
    }

    // Source 2: Config file
    let state_dir = resolve_state_dir();
    let config_path = state_dir.join("openclawcn.json");
    if let Ok(content) = fs::read_to_string(&config_path) {
        if let Ok(val) = json5::from_str::<serde_json::Value>(&content) {
            discover_from_config(&val, &mut providers, &mut seen_ids);
        }
    }

    // Source 3: Auth profiles
    discover_from_auth_profiles(&state_dir, &mut providers, &mut seen_ids);

    providers
}

fn discover_from_config(
    config: &serde_json::Value,
    providers: &mut Vec<DiscoveredProvider>,
    seen: &mut std::collections::HashSet<String>,
) {
    let models_providers = match config.get("models").and_then(|m| m.get("providers")).and_then(|p| p.as_object()) {
        Some(p) => p,
        None => return,
    };

    for (id, provider_config) in models_providers {
        if seen.contains(id) {
            continue;
        }
        let api_key_raw = provider_config.get("apiKey").and_then(|v| v.as_str()).unwrap_or("");
        if api_key_raw.is_empty() {
            continue;
        }

        // Resolve ${ENV_VAR} substitution
        let api_key = resolve_env_substitution(api_key_raw);
        if api_key.is_empty() {
            continue;
        }

        let base_url = provider_config.get("baseUrl")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        if base_url.is_empty() {
            continue;
        }

        let api_type_str = provider_config.get("api")
            .and_then(|v| v.as_str())
            .unwrap_or("openai-completions");

        let api_type = if api_type_str.contains("anthropic") {
            ApiType::AnthropicMessages
        } else if base_url.contains("generativelanguage.googleapis.com") {
            ApiType::GoogleGemini
        } else {
            // Also check KNOWN_PROVIDERS for api_type match
            KNOWN_PROVIDERS.iter()
                .find(|k| k.id == normalize_provider_id(id))
                .map(|k| k.api_type.clone())
                .unwrap_or(ApiType::OpenAiCompat)
        };

        // Try to find a model ID from the config
        let default_model = provider_config.get("models")
            .and_then(|m| m.as_array())
            .and_then(|arr| arr.first())
            .and_then(|m| m.get("id"))
            .and_then(|v| v.as_str())
            .unwrap_or("default")
            .to_string();

        let normalized_id = normalize_provider_id(id);

        // Look up extra headers from known providers
        let mut headers = HashMap::new();
        if let Some(kp) = KNOWN_PROVIDERS.iter().find(|k| k.id == normalized_id) {
            for (k, v) in kp.extra_headers {
                headers.insert(k.to_string(), v.to_string());
            }
        }

        let name = KNOWN_PROVIDERS.iter()
            .find(|k| k.id == normalized_id)
            .map(|k| k.name.to_string())
            .unwrap_or_else(|| id.clone());

        seen.insert(normalized_id.clone());
        providers.push(DiscoveredProvider {
            id: normalized_id,
            name,
            base_url,
            api_key,
            api_type,
            source: format!("config:models.providers.{}", id),
            extra_headers: headers,
            default_model,
        });
    }
}

fn discover_from_auth_profiles(
    state_dir: &std::path::Path,
    providers: &mut Vec<DiscoveredProvider>,
    seen: &mut std::collections::HashSet<String>,
) {
    let auth_path = state_dir
        .join("agents").join("main").join("agent").join("auth-profiles.json");

    let content = match fs::read_to_string(&auth_path) {
        Ok(c) => c,
        Err(_) => return,
    };

    let parsed: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return,
    };

    // Plaintext auth profiles
    extract_api_keys_from_profiles(&parsed, providers, seen);
}

fn extract_api_keys_from_profiles(
    profiles_data: &serde_json::Value,
    providers: &mut Vec<DiscoveredProvider>,
    seen: &mut std::collections::HashSet<String>,
) {
    let profiles = match profiles_data.get("profiles").and_then(|p| p.as_object()) {
        Some(p) => p,
        None => return,
    };

    for (profile_id, profile) in profiles {
        let profile_type = profile.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let provider_id = profile.get("provider").and_then(|v| v.as_str()).unwrap_or("");

        if provider_id.is_empty() {
            continue;
        }

        let normalized_id = normalize_provider_id(provider_id);
        if seen.contains(&normalized_id) {
            continue;
        }

        let api_key = match profile_type {
            "api_key" => profile.get("key").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            "token" => profile.get("token").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            _ => continue, // Skip oauth (needs refresh logic)
        };

        if api_key.is_empty() {
            continue;
        }

        // Look up known provider info
        if let Some(kp) = KNOWN_PROVIDERS.iter().find(|k| k.id == normalized_id) {
            let mut headers = HashMap::new();
            for (k, v) in kp.extra_headers {
                headers.insert(k.to_string(), v.to_string());
            }

            seen.insert(normalized_id.clone());
            providers.push(DiscoveredProvider {
                id: normalized_id,
                name: kp.name.to_string(),
                base_url: kp.base_url.to_string(),
                api_key,
                api_type: kp.api_type.clone(),
                source: format!("auth-profile:{}", profile_id),
                extra_headers: headers,
                default_model: kp.default_model.to_string(),
            });
        }
    }
}

fn resolve_env_substitution(value: &str) -> String {
    // Handle ${ENV_VAR} pattern
    if value.starts_with("${") && value.ends_with('}') {
        let var_name = &value[2..value.len() - 1];
        return std::env::var(var_name).unwrap_or_default();
    }
    // Handle bare env var name (e.g., "DEEPSEEK_API_KEY" without ${})
    // Only if it looks like an env var name (all caps + underscores)
    if value.chars().all(|c| c.is_ascii_uppercase() || c == '_') && value.contains('_') {
        if let Ok(resolved) = std::env::var(value) {
            return resolved;
        }
    }
    value.to_string()
}

fn normalize_provider_id(id: &str) -> String {
    match id {
        "kimi-code" | "kimi_code" | "kimicode" => "kimi-coding".to_string(),
        "z.ai" | "z-ai" => "zai".to_string(),
        "qwen" => "qwen-dashscope".to_string(),
        "dashscope" => "qwen-dashscope".to_string(),
        "zhipu" => "glm".to_string(),
        "ark" => "doubao".to_string(),
        other => other.to_string(),
    }
}

/// Global in-memory cache of discovered providers.
/// Updated by `discover_and_cache()`, read by `get_cached_provider()`.
static PROVIDER_CACHE: std::sync::Mutex<Option<Vec<DiscoveredProvider>>> =
    std::sync::Mutex::new(None);

/// Discover providers and cache them in memory for AI chat use.
/// Reads `modelCapability.capabilities.text` from config to determine the
/// user's preferred text model provider, and sorts it to the front.
pub fn discover_and_cache() -> Vec<ProviderInfo> {
    let mut providers = discover_providers();

    // Read the user's preferred text model from config
    let state_dir = resolve_state_dir();
    let config_path = state_dir.join("openclawcn.json");
    let preferred = if let Ok(content) = fs::read_to_string(&config_path) {
        if let Ok(val) = json5::from_str::<serde_json::Value>(&content) {
            read_preferred_text_provider(&val)
        } else {
            None
        }
    } else {
        None
    };

    // If we found a preferred provider, update its default_model and sort it first
    let preferred_id = preferred.as_ref().map(|(pid, _)| normalize_provider_id(pid));
    let preferred_model = preferred.as_ref().map(|(_, mid)| mid.clone());

    if let Some(ref pid) = preferred_id {
        if let Some(p) = providers.iter_mut().find(|p| &p.id == pid) {
            // Override default_model with the user's configured text model
            if let Some(ref model) = preferred_model {
                if !model.is_empty() {
                    p.default_model = model.clone();
                }
            }
        }
        // Sort preferred provider to front
        providers.sort_by(|a, b| {
            let a_pref = &a.id == pid;
            let b_pref = &b.id == pid;
            b_pref.cmp(&a_pref)
        });
    }

    let mut infos: Vec<ProviderInfo> = providers.iter().map(|p| p.to_info()).collect();

    // Mark the preferred provider
    if let Some(ref pid) = preferred_id {
        if let Some(info) = infos.iter_mut().find(|i| &i.id == pid) {
            info.is_preferred = true;
        }
    }

    *PROVIDER_CACHE.lock().unwrap() = Some(providers);
    infos
}

/// Read `modelCapability.capabilities.text` from config to get the user's
/// preferred text model. Returns (providerId, modelId) if found.
fn read_preferred_text_provider(config: &serde_json::Value) -> Option<(String, String)> {
    let text_cap = config
        .get("modelCapability")
        .and_then(|mc| mc.get("capabilities"))
        .and_then(|caps| caps.get("text"))?;

    let provider_id = text_cap.get("providerId").and_then(|v| v.as_str())?;
    let model_id = text_cap.get("modelId").and_then(|v| v.as_str()).unwrap_or("");

    if provider_id.is_empty() {
        return None;
    }

    Some((provider_id.to_string(), model_id.to_string()))
}

/// Get a cached provider by ID (for making AI calls without re-reading disk).
pub fn get_cached_provider(id: &str) -> Option<DiscoveredProvider> {
    let cache = PROVIDER_CACHE.lock().unwrap();
    cache.as_ref()?.iter().find(|p| p.id == id).cloned()
}

// ── Auth profile envelope (for deserialization) ──────────────────────────────

#[derive(Deserialize)]
struct _AuthProfileStore {
    #[allow(dead_code)]
    version: Option<u32>,
    profiles: Option<HashMap<String, serde_json::Value>>,
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repair::TEST_ENV_LOCK;

    // ── mask_key tests ──────────────────────────────────────────────

    #[test]
    fn test_mask_key_short_key() {
        assert_eq!(mask_key("abc"), "***");
        assert_eq!(mask_key(""), "***");
        assert_eq!(mask_key("12345678"), "***");
    }

    #[test]
    fn test_mask_key_long_key() {
        assert_eq!(mask_key("sk-abcdef123456"), "sk-abc...***");
        assert_eq!(mask_key("123456789"), "123456...***");
    }

    // ── normalize_provider_id tests ─────────────────────────────────

    #[test]
    fn test_normalize_kimi_variants() {
        assert_eq!(normalize_provider_id("kimi-code"), "kimi-coding");
        assert_eq!(normalize_provider_id("kimi_code"), "kimi-coding");
        assert_eq!(normalize_provider_id("kimicode"), "kimi-coding");
        assert_eq!(normalize_provider_id("kimi-coding"), "kimi-coding");
    }

    #[test]
    fn test_normalize_qwen_variants() {
        assert_eq!(normalize_provider_id("qwen"), "qwen-dashscope");
        assert_eq!(normalize_provider_id("dashscope"), "qwen-dashscope");
        assert_eq!(normalize_provider_id("qwen-dashscope"), "qwen-dashscope");
    }

    #[test]
    fn test_normalize_other_aliases() {
        assert_eq!(normalize_provider_id("z.ai"), "zai");
        assert_eq!(normalize_provider_id("z-ai"), "zai");
        assert_eq!(normalize_provider_id("zhipu"), "glm");
        assert_eq!(normalize_provider_id("ark"), "doubao");
    }

    #[test]
    fn test_normalize_passthrough() {
        assert_eq!(normalize_provider_id("deepseek"), "deepseek");
        assert_eq!(normalize_provider_id("openai"), "openai");
        assert_eq!(normalize_provider_id("anthropic"), "anthropic");
        assert_eq!(normalize_provider_id("custom-thing"), "custom-thing");
    }

    // ── resolve_env_substitution tests ──────────────────────────────

    #[test]
    fn test_env_substitution_dollar_brace() {
        let _lock = TEST_ENV_LOCK.lock().unwrap();
        std::env::set_var("_TEST_REPAIR_KEY_1", "test-value-123");
        assert_eq!(resolve_env_substitution("${_TEST_REPAIR_KEY_1}"), "test-value-123");
        std::env::remove_var("_TEST_REPAIR_KEY_1");
    }

    #[test]
    fn test_env_substitution_missing_var() {
        let _lock = TEST_ENV_LOCK.lock().unwrap();
        std::env::remove_var("_TEST_NONEXISTENT_VAR_REPAIR");
        assert_eq!(resolve_env_substitution("${_TEST_NONEXISTENT_VAR_REPAIR}"), "");
    }

    #[test]
    fn test_env_substitution_bare_env_name() {
        let _lock = TEST_ENV_LOCK.lock().unwrap();
        std::env::set_var("_TEST_BARE_KEY", "bare-val");
        assert_eq!(resolve_env_substitution("_TEST_BARE_KEY"), "bare-val");
        std::env::remove_var("_TEST_BARE_KEY");
    }

    #[test]
    fn test_env_substitution_literal_value() {
        assert_eq!(resolve_env_substitution("sk-abc123def"), "sk-abc123def");
        assert_eq!(resolve_env_substitution("https://api.example.com"), "https://api.example.com");
    }

    // ── DiscoveredProvider::to_info tests ───────────────────────────

    #[test]
    fn test_provider_to_info_masks_key() {
        let provider = DiscoveredProvider {
            id: "test".into(),
            name: "Test Provider".into(),
            base_url: "https://api.test.com".into(),
            api_key: "sk-secret-key-12345".into(),
            api_type: ApiType::OpenAiCompat,
            source: "test".into(),
            extra_headers: HashMap::new(),
            default_model: "test-model".into(),
        };
        let info = provider.to_info();
        assert_eq!(info.id, "test");
        assert_eq!(info.name, "Test Provider");
        assert_eq!(info.key_preview, "sk-sec...***");
        assert!(!info.key_preview.contains("12345"));
    }

    // ── discover_from_config tests ──────────────────────────────────

    #[test]
    fn test_discover_from_config_basic() {
        let config: serde_json::Value = serde_json::json!({
            "models": {
                "providers": {
                    "deepseek": {
                        "baseUrl": "https://api.deepseek.com",
                        "apiKey": "example-deepseek-api-key",
                        "api": "openai-completions",
                        "models": [{"id": "deepseek-chat"}]
                    }
                }
            }
        });

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        discover_from_config(&config, &mut providers, &mut seen);

        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].id, "deepseek");
        assert_eq!(providers[0].api_key, "example-deepseek-api-key");
        assert_eq!(providers[0].api_type, ApiType::OpenAiCompat);
        assert_eq!(providers[0].default_model, "deepseek-chat");
    }

    #[test]
    fn test_discover_from_config_anthropic_api() {
        let config: serde_json::Value = serde_json::json!({
            "models": {
                "providers": {
                    "anthropic": {
                        "baseUrl": "https://api.anthropic.com",
                        "apiKey": "sk-ant-xxx",
                        "api": "anthropic-messages"
                    }
                }
            }
        });

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        discover_from_config(&config, &mut providers, &mut seen);

        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].api_type, ApiType::AnthropicMessages);
    }

    #[test]
    fn test_discover_from_config_kimi_normalization() {
        let config: serde_json::Value = serde_json::json!({
            "models": {
                "providers": {
                    "kimi-code": {
                        "baseUrl": "https://api.kimi.com/coding/v1",
                        "apiKey": "sk-kimi-xxx"
                    }
                }
            }
        });

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        discover_from_config(&config, &mut providers, &mut seen);

        assert_eq!(providers.len(), 1);
        // Provider ID should be normalized
        assert_eq!(providers[0].id, "kimi-coding");
        // Should have kimi-specific headers
        assert_eq!(providers[0].extra_headers.get("User-Agent").map(|s| s.as_str()), Some("KimiCLI/1.16.0"));
    }

    #[test]
    fn test_discover_from_config_skips_empty_key() {
        let config: serde_json::Value = serde_json::json!({
            "models": {
                "providers": {
                    "test": {
                        "baseUrl": "https://api.test.com",
                        "apiKey": ""
                    }
                }
            }
        });

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        discover_from_config(&config, &mut providers, &mut seen);

        assert_eq!(providers.len(), 0);
    }

    #[test]
    fn test_discover_from_config_skips_empty_url() {
        let config: serde_json::Value = serde_json::json!({
            "models": {
                "providers": {
                    "test": {
                        "baseUrl": "",
                        "apiKey": "sk-xxx"
                    }
                }
            }
        });

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        discover_from_config(&config, &mut providers, &mut seen);

        assert_eq!(providers.len(), 0);
    }

    #[test]
    fn test_discover_from_config_env_substitution() {
        let _lock = TEST_ENV_LOCK.lock().unwrap();
        std::env::set_var("_TEST_CFG_API_KEY", "resolved-api-key");
        let config: serde_json::Value = serde_json::json!({
            "models": {
                "providers": {
                    "test-provider": {
                        "baseUrl": "https://api.test.com",
                        "apiKey": "${_TEST_CFG_API_KEY}"
                    }
                }
            }
        });

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        discover_from_config(&config, &mut providers, &mut seen);

        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].api_key, "resolved-api-key");
        std::env::remove_var("_TEST_CFG_API_KEY");
    }

    #[test]
    fn test_discover_from_config_deduplication() {
        let config: serde_json::Value = serde_json::json!({
            "models": {
                "providers": {
                    "deepseek": {
                        "baseUrl": "https://api.deepseek.com",
                        "apiKey": "sk-1"
                    }
                }
            }
        });

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        seen.insert("deepseek".to_string()); // Already seen from env
        discover_from_config(&config, &mut providers, &mut seen);

        // Should be skipped because already seen
        assert_eq!(providers.len(), 0);
    }

    // ── extract_api_keys_from_profiles tests ────────────────────────

    #[test]
    fn test_extract_api_key_profiles() {
        let data = serde_json::json!({
            "version": 1,
            "profiles": {
                "deepseek:default": {
                    "type": "api_key",
                    "provider": "deepseek",
                    "key": "example-deepseek-profile-key"
                }
            }
        });

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        extract_api_keys_from_profiles(&data, &mut providers, &mut seen);

        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].id, "deepseek");
        assert_eq!(providers[0].api_key, "example-deepseek-profile-key");
        assert!(providers[0].source.starts_with("auth-profile:"));
    }

    #[test]
    fn test_extract_token_type_profiles() {
        let data = serde_json::json!({
            "version": 1,
            "profiles": {
                "openai:default": {
                    "type": "token",
                    "provider": "openai",
                    "token": "tok-openai-xxx"
                }
            }
        });

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        extract_api_keys_from_profiles(&data, &mut providers, &mut seen);

        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].api_key, "tok-openai-xxx");
    }

    #[test]
    fn test_extract_skips_oauth_profiles() {
        let data = serde_json::json!({
            "version": 1,
            "profiles": {
                "google:default": {
                    "type": "oauth",
                    "provider": "openai",
                    "accessToken": "ya29.xxx"
                }
            }
        });

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        extract_api_keys_from_profiles(&data, &mut providers, &mut seen);

        assert_eq!(providers.len(), 0);
    }

    #[test]
    fn test_extract_skips_unknown_provider() {
        let data = serde_json::json!({
            "version": 1,
            "profiles": {
                "custom:default": {
                    "type": "api_key",
                    "provider": "totally-unknown-provider",
                    "key": "sk-xxx"
                }
            }
        });

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        extract_api_keys_from_profiles(&data, &mut providers, &mut seen);

        // Unknown provider should not be added (no KNOWN_PROVIDERS match)
        assert_eq!(providers.len(), 0);
    }

    #[test]
    fn test_extract_normalizes_kimi_code() {
        let data = serde_json::json!({
            "version": 1,
            "profiles": {
                "kimi-code:default": {
                    "type": "api_key",
                    "provider": "kimi-code",
                    "key": "sk-kimi-xxx"
                }
            }
        });

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        extract_api_keys_from_profiles(&data, &mut providers, &mut seen);

        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].id, "kimi-coding");
        assert_eq!(providers[0].extra_headers.get("User-Agent").map(|s| s.as_str()), Some("KimiCLI/1.16.0"));
    }

    // ── AES-256-GCM decryption test ─────────────────────────────────

    // ── discover_from_auth_profiles integration test ─────────────────

    #[test]
    fn test_discover_from_plaintext_auth_profiles() {
        let temp_dir = std::env::temp_dir().join("_repair_test_auth_plain");
        let agent_dir = temp_dir.join("agents").join("main").join("agent");
        let _ = fs::create_dir_all(&agent_dir);

        let profiles = serde_json::json!({
            "version": 1,
            "profiles": {
                "moonshot:default": {
                    "type": "api_key",
                    "provider": "moonshot",
                    "key": "sk-moonshot-test"
                }
            }
        });
        fs::write(agent_dir.join("auth-profiles.json"),
            serde_json::to_string(&profiles).unwrap()
        ).unwrap();

        let mut providers = Vec::new();
        let mut seen = std::collections::HashSet::new();
        discover_from_auth_profiles(&temp_dir, &mut providers, &mut seen);

        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].id, "moonshot");
        assert_eq!(providers[0].api_key, "sk-moonshot-test");
        assert_eq!(providers[0].source, "auth-profile:moonshot:default");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    // ── KNOWN_PROVIDERS sanity checks ──────────────────────────────

    #[test]
    fn test_known_providers_has_kimi_headers() {
        let kimi = KNOWN_PROVIDERS.iter().find(|p| p.id == "kimi-coding").unwrap();
        assert_eq!(kimi.extra_headers.len(), 1);
        assert_eq!(kimi.extra_headers[0], ("User-Agent", "KimiCLI/1.16.0"));
    }

    #[test]
    fn test_known_providers_anthropic_is_messages_api() {
        let anthropic = KNOWN_PROVIDERS.iter().find(|p| p.id == "anthropic").unwrap();
        assert_eq!(anthropic.api_type, ApiType::AnthropicMessages);
    }

    #[test]
    fn test_known_providers_all_have_env_vars() {
        for kp in KNOWN_PROVIDERS {
            assert!(!kp.env_vars.is_empty(), "Provider {} should have env vars", kp.id);
        }
    }

    #[test]
    fn test_known_providers_all_have_default_model() {
        for kp in KNOWN_PROVIDERS {
            assert!(!kp.default_model.is_empty(), "Provider {} should have default model", kp.id);
        }
    }

    // ── env var discovery ───────────────────────────────────────────

    #[test]
    fn test_discover_from_env_var() {
        let _lock = TEST_ENV_LOCK.lock().unwrap();
        // Point state dir to a temp dir with no config/auth files to avoid
        // side effects from auth-profiles on the test machine.
        let temp_dir = std::env::temp_dir().join("_repair_test_env_discover");
        let _ = fs::create_dir_all(&temp_dir);

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp_dir.to_str().unwrap());
        std::env::set_var("DEEPSEEK_API_KEY", "_test_repair_ds_key");

        let providers = discover_providers();
        let ds = providers.iter().find(|p| p.id == "deepseek");
        assert!(ds.is_some(), "Should discover deepseek from env var");
        assert_eq!(ds.unwrap().api_key, "_test_repair_ds_key");
        assert!(ds.unwrap().source.starts_with("env:"));

        std::env::remove_var("DEEPSEEK_API_KEY");
        std::env::remove_var("OPENCLAWCN_STATE_DIR");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    // ── cache tests ────────────────────────────────────────────────

    #[test]
    fn test_get_cached_provider_returns_none_before_cache() {
        // Clear cache
        *PROVIDER_CACHE.lock().unwrap() = None;
        assert!(get_cached_provider("deepseek").is_none());
    }
}
