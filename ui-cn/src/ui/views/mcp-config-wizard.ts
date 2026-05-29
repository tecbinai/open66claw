/**
 * mcp-config-wizard.ts
 * API Key configuration wizard modal for MCP capabilities that need setup.
 *
 * Design: 3-step flow (visit site → get key → paste here)
 * with test-connection button and advanced config fold.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { McpMarketplaceItem } from "../app-view-state.js";
import { t } from "../i18n/index.js";
import { icons } from "../icons.js";

export type McpInstallOverrides = {
  sseUrl?: string;
  npmPackage?: string;
  pypiPackage?: string;
};

export type McpConfigWizardProps = {
  item: McpMarketplaceItem;
  onClose: () => void;
  onSaveAndEnable: (env: Record<string, string>, overrides?: McpInstallOverrides) => void;
  onTestConnection: (env: Record<string, string>) => void;
  /** Test state managed by parent */
  testState: "idle" | "testing" | "success" | "error";
  testMessage?: string;
};

/* ── Collect env field values from the dynamic form ────── */

function collectEnvFields(e: Event): Record<string, string> {
  const dialog = (e.target as HTMLElement).closest("[role=dialog]");
  if (!dialog) return {};
  const env: Record<string, string> = {};
  const inputs = dialog.querySelectorAll<HTMLInputElement>(".mcp-env-field");
  inputs.forEach((input) => {
    const key = input.dataset.envKey;
    const val = input.value?.trim();
    if (key && val) env[key] = val;
  });
  return env;
}

/* ── main render ───────────────────────────────────────── */

export function renderMcpConfigWizard(props: McpConfigWizardProps): TemplateResult {
  const { item, onClose, onSaveAndEnable, onTestConnection, testState, testMessage } = props;

  // Build the list of env fields to show:
  // If envSchema exists, use it; otherwise fall back to single apiKeyName
  const envFields: Array<{
    key: string;
    description: string;
    placeholder: string;
    required: boolean;
  }> = [];
  if (item.envSchema && Object.keys(item.envSchema).length > 0) {
    const requiredSet = new Set(item.envRequired ?? []);
    // If envRequired is empty, treat credential-looking keys as required
    const inferRequired = requiredSet.size === 0;
    for (const [key, schema] of Object.entries(item.envSchema)) {
      const looksRequired =
        inferRequired && /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH|API/i.test(key);
      envFields.push({
        key,
        description: schema.description ?? "",
        placeholder: schema.placeholder ?? key,
        required: requiredSet.has(key) || looksRequired,
      });
    }
  } else if (item.apiKeyName || item.requiresApiKey) {
    const keyFieldName = item.apiKeyName ?? "API_KEY";
    envFields.push({
      key: keyFieldName,
      description: "",
      placeholder: keyFieldName,
      required: true,
    });
  }

  return html`
    <!-- Backdrop -->
    <div
      @click=${onClose}
      class="ext-glass-overlay"
      style="z-index:9100"
    ></div>

    <!-- Wizard panel -->
    <div
      role="dialog"
      aria-modal="true"
      aria-label="${t("extensions.config.title").replace("{{name}}", item.friendlyName)}"
      class="ext-glass-modal ext-glass-modal--wizard"
      @click=${(e: Event) => e.stopPropagation()}
    >
      <!-- Close -->
      <button
        @click=${onClose}
        class="ext-modal-close"
      >&times;</button>

      <!-- Title -->
      <div class="ext-modal-title">
        ${t("extensions.config.title").replace("{{name}}", item.friendlyName)}
      </div>
      <div class="ext-modal-subtitle" style="margin-bottom:24px;">
        ${
          envFields.length > 0
            ? html`${item.friendlyName} ${t("extensions.config.needsEnvVars" as never)}`
            : html`${t("extensions.config.configAdvanced" as never)}`
        }
      </div>

      <!-- Install method override (shown only for items without install info) -->
      ${
        item.installable === false
          ? html`
        <div class="ext-form-card" style="margin-bottom:20px;">
          <div style="font-size:13px; font-weight:600; color:var(--fg); margin-bottom:10px;">
            ${t("extensions.config.installMethod" as never)}
          </div>
          <div style="font-size:11px; color:var(--muted-strong, #6b7d91); margin-bottom:12px;">
            ${t("extensions.config.installMethodHint" as never)}
          </div>
          <div style="display:flex; gap:8px; margin-bottom:12px;">
            ${["sse", "npm", "pypi"].map(
              (m) => html`
              <label style="
                display:flex; align-items:center; gap:4px;
                font-size:12px; color:var(--fg-secondary, #a0aec0);
                cursor:pointer;
              ">
                <input
                  type="radio"
                  name="mcp-install-method"
                  value=${m}
                  ?checked=${m === "sse"}
                  @change=${(e: Event) => {
                    const radio = e.target as HTMLInputElement;
                    const container = radio.closest("[role=dialog]");
                    const sseInput = container?.querySelector(
                      "#mcp-override-sse",
                    ) as HTMLElement | null;
                    const npmInput = container?.querySelector(
                      "#mcp-override-npm",
                    ) as HTMLElement | null;
                    const pypiInput = container?.querySelector(
                      "#mcp-override-pypi",
                    ) as HTMLElement | null;
                    if (sseInput) sseInput.style.display = radio.value === "sse" ? "block" : "none";
                    if (npmInput) npmInput.style.display = radio.value === "npm" ? "block" : "none";
                    if (pypiInput)
                      pypiInput.style.display = radio.value === "pypi" ? "block" : "none";
                  }}
                  style="accent-color:var(--accent, #6c8cff);"
                />
                ${m === "sse" ? "SSE" : m === "npm" ? "npm" : "PyPI"}
              </label>
            `,
            )}
          </div>
          <div id="mcp-override-sse" style="display:block;">
            <input
              id="mcp-override-sse-input"
              type="text"
              placeholder="https://example.com/mcp/sse"
              class="ext-glass-input"
            />
          </div>
          <div id="mcp-override-npm" style="display:none;">
            <input
              id="mcp-override-npm-input"
              type="text"
              placeholder="@scope/package-name"
              class="ext-glass-input"
            />
          </div>
          <div id="mcp-override-pypi" style="display:none;">
            <input
              id="mcp-override-pypi-input"
              type="text"
              placeholder="package-name"
              class="ext-glass-input"
            />
          </div>
        </div>
      `
          : nothing
      }

      <!-- API Key registration guide (when env fields exist and we have a guide URL or configHint) -->
      ${
        envFields.length > 0 &&
        (item.apiKeyGuideUrl ||
          item.configHint ||
          envFields.some((f) => f.placeholder && /^https?:\/\//.test(f.placeholder)))
          ? html`
          <div class="ext-alert-box ext-alert-box--warning" style="margin-bottom:16px;">
            ${
              item.configHint
                ? html`<div style="font-size:11px; line-height:1.5; margin-bottom:${item.apiKeyGuideUrl ? "8" : "0"}px;">
                  ${item.configHint}
                </div>`
                : nothing
            }
            ${(() => {
              const guideUrl =
                item.apiKeyGuideUrl ||
                envFields.map((f) => f.placeholder).find((p) => p && /^https?:\/\//.test(p));
              return guideUrl
                ? html`<a
                    href=${guideUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style="font-size:12px; color:var(--accent-2, #20d5bc); text-decoration:none; display:inline-flex; align-items:center; gap:4px;"
                  >${t("extensions.config.step1Action")} <span class="mcp-icon" style="font-size:11px;">${icons.link}</span></a>`
                : nothing;
            })()}
          </div>
        `
          : nothing
      }

      <!-- Dynamic env var form based on envSchema -->
      ${
        envFields.length > 0
          ? html`
        <div class="ext-form-card" style="margin-bottom:20px;">
          ${envFields.map(
            (field, idx) => html`
            <div style="margin-bottom:${idx < envFields.length - 1 ? "14px" : "0"};">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                <span style="
                  font-size:12px; font-weight:600; color:var(--fg);
                  font-family:monospace;
                ">${field.key}</span>
                ${
                  field.required
                    ? html`<span style="
                  font-size:9px; padding:1px 6px; border-radius:3px;
                  background:rgba(248,113,113,0.12); color:var(--danger, #f87171);
                ">${t("extensions.config.required" as never)}</span>`
                    : html`<span style="
                  font-size:9px; padding:1px 6px; border-radius:3px;
                  background:rgba(148,163,184,0.08); color:#6b7d91;
                ">${t("extensions.config.optional" as never)}</span>`
                }
              </div>
              ${
                field.description
                  ? html`<div style="
                font-size:11px; color:var(--muted-strong, #6b7d91);
                margin-bottom:6px; line-height:1.4;
              ">${field.description}</div>`
                  : nothing
              }
              <input
                class="mcp-env-field ext-glass-input"
                data-env-key="${field.key}"
                type="password"
                placeholder="${field.placeholder}"
                autocomplete="off"
              />
            </div>
          `,
          )}
          <div style="
            font-size:10px; color:var(--muted-strong, #6b7d91);
            margin-top:10px; display:flex; align-items:center; gap:4px;
          ">
            <span class="mcp-icon" style="font-size:12px;">${icons.key}</span> ${t("extensions.config.keyLocal")}
          </div>
        </div>
      `
          : html`
        <!-- No env fields: show a hint that env vars can be added below -->
        <div class="ext-alert-box ext-alert-box--info" style="margin-bottom:16px; line-height:1.5;">
          ${t("extensions.config.noEnvHint" as never)}
          ${
            item.sourceUrl
              ? html`<br/><a
            href=${item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style="font-size:12px; color:var(--accent-2, #20d5bc); text-decoration:none; margin-top:4px; display:inline-block;"
          >${t("extensions.store.viewSource" as never)} <span class="mcp-icon" style="font-size:11px;">${icons.link}</span></a>`
              : nothing
          }
        </div>
      `
      }

      <!-- Test connection result -->
      ${
        testState !== "idle"
          ? html`
            <div class="ext-alert-box" style="
              margin-bottom:16px;
              background:${
                testState === "success"
                  ? "rgba(52,211,153,0.08)"
                  : testState === "error"
                    ? "rgba(248,113,113,0.08)"
                    : "rgba(var(--accent-rgb, 108,140,255),0.06)"
              };
              border:1px solid ${
                testState === "success"
                  ? "rgba(52,211,153,0.15)"
                  : testState === "error"
                    ? "rgba(248,113,113,0.15)"
                    : "rgba(var(--accent-rgb, 108,140,255),0.1)"
              };
              color:${
                testState === "success"
                  ? "var(--ok, #34d399)"
                  : testState === "error"
                    ? "var(--danger, #f87171)"
                    : "var(--accent, #6c8cff)"
              };
              display:flex; align-items:center; gap:8px;
            ">
              ${
                testState === "testing"
                  ? html`
                      <span class="ext-spinner ext-spinner--md"></span>
                    `
                  : testState === "success"
                    ? html`<span class="mcp-icon" style="font-size:14px;">${icons.check}</span>`
                    : html`<span class="mcp-icon" style="font-size:14px;">${icons.xCircle}</span>`
              }
              <span>${
                testMessage ??
                (testState === "testing"
                  ? t("extensions.config.testConnection")
                  : testState === "success"
                    ? t("extensions.config.testSuccess")
                    : t("extensions.config.testFailed"))
              }</span>
            </div>
          `
          : nothing
      }

      <!-- Action buttons -->
      <div class="ext-modal-actions">
        <button
          @click=${(e: Event) => {
            const env = collectEnvFields(e);
            if (Object.keys(env).length > 0) onTestConnection(env);
          }}
          class="ext-pill-btn"
        >${t("extensions.config.testConnection")}</button>

        <button
          @click=${(e: Event) => {
            const env = collectEnvFields(e);
            // For manual-config items, env is optional; otherwise need at least one value
            if (Object.keys(env).length === 0 && item.installable !== false) return;
            // Merge extra env vars from advanced config — use dialog-relative lookup
            const dialog = (e.target as HTMLElement).closest("[role=dialog]");
            const extraContainer = dialog?.querySelector("#mcp-extra-env");
            if (extraContainer) {
              const templateRow = extraContainer.querySelector(".mcp-env-row-template");
              if (templateRow) {
                const k = (
                  templateRow.querySelector(".mcp-env-key") as HTMLInputElement
                )?.value?.trim();
                const v = (
                  templateRow.querySelector(".mcp-env-val") as HTMLInputElement
                )?.value?.trim();
                if (k && v) env[k] = v;
              }
              const dynamicRows = extraContainer.querySelectorAll("#mcp-env-rows > div");
              dynamicRows.forEach((row) => {
                const k = (row.querySelector(".mcp-env-key") as HTMLInputElement)?.value?.trim();
                const v = (row.querySelector(".mcp-env-val") as HTMLInputElement)?.value?.trim();
                if (k && v) env[k] = v;
              });
            }
            // Collect install method overrides (for manual-config items) — dialog-relative
            const overrides: McpInstallOverrides = {};
            const sseInput = dialog?.querySelector(
              "#mcp-override-sse-input",
            ) as HTMLInputElement | null;
            const npmInput = dialog?.querySelector(
              "#mcp-override-npm-input",
            ) as HTMLInputElement | null;
            const pypiInput = dialog?.querySelector(
              "#mcp-override-pypi-input",
            ) as HTMLInputElement | null;
            const selectedMethod = (
              dialog?.querySelector('input[name="mcp-install-method"]:checked') as HTMLInputElement
            )?.value;
            if (selectedMethod === "sse" && sseInput?.value?.trim()) {
              overrides.sseUrl = sseInput.value.trim();
            } else if (selectedMethod === "npm" && npmInput?.value?.trim()) {
              overrides.npmPackage = npmInput.value.trim();
            } else if (selectedMethod === "pypi" && pypiInput?.value?.trim()) {
              overrides.pypiPackage = pypiInput.value.trim();
            }
            onSaveAndEnable(env, Object.keys(overrides).length > 0 ? overrides : undefined);
          }}
          class="ext-pill-btn ext-pill-btn--primary"
        >${t("extensions.config.saveAndEnable")}</button>
      </div>

      <!-- Advanced config (collapsed) -->
      <details style="margin-top:20px;">
        <summary class="ext-details-summary">${t("extensions.config.advancedConfig")}</summary>
        <div style="margin-top:12px;">
          <!-- Additional env vars table -->
          <div style="font-size:11px; color:var(--muted-strong, #6b7d91); margin-bottom:8px;">
            ${t("extensions.config.envVars")}
          </div>
          <div id="mcp-extra-env" class="ext-form-card" style="font-size:12px; color:var(--fg-secondary, #a0aec0);">
            <div id="mcp-env-rows"></div>
            <div style="display:flex; gap:8px; margin-bottom:8px;" class="mcp-env-row-template">
              <input
                placeholder="KEY"
                class="mcp-env-key ext-glass-input"
                style="flex:1;"
              />
              <input
                placeholder="VALUE"
                class="mcp-env-val ext-glass-input"
                style="flex:1;"
              />
            </div>
            <button
              @click=${(e: Event) => {
                const container = (e.target as HTMLElement).closest("#mcp-extra-env");
                const rows = container?.querySelector("#mcp-env-rows");
                if (!rows) return;
                const row = document.createElement("div");
                row.style.cssText = "display:flex; gap:8px; margin-bottom:8px;";

                // Create elements via DOM API instead of innerHTML (prevents XSS)
                const keyInput = document.createElement("input");
                keyInput.placeholder = "KEY";
                keyInput.className = "mcp-env-key";
                keyInput.style.cssText =
                  "flex:1; padding:6px 10px; border:1px solid var(--border); border-radius:6px; background:transparent; color:var(--fg); font-size:11px; outline:none;";

                const valInput = document.createElement("input");
                valInput.placeholder = "VALUE";
                valInput.className = "mcp-env-val";
                valInput.style.cssText =
                  "flex:1; padding:6px 10px; border:1px solid var(--border); border-radius:6px; background:transparent; color:var(--fg); font-size:11px; outline:none;";

                const removeBtn = document.createElement("button");
                removeBtn.style.cssText =
                  "all:unset; cursor:pointer; font-size:14px; color:var(--muted-strong, #6b7d91); padding:0 4px;";
                removeBtn.textContent = "\u00D7";
                removeBtn.addEventListener("click", () => row.remove());

                row.appendChild(keyInput);
                row.appendChild(valInput);
                row.appendChild(removeBtn);
                rows.appendChild(row);
              }}
              style="
                all:unset; cursor:pointer;
                font-size:11px; color:var(--accent-2, #20d5bc);
              "
            >+ ${t("extensions.config.addEnvVar")}</button>
          </div>

          <!-- Timeout -->
          <div style="margin-top:14px; display:flex; align-items:center; gap:10px;">
            <span style="font-size:11px; color:var(--muted-strong, #6b7d91);">
              ${t("extensions.config.timeout")}
            </span>
            <input
              type="number"
              value="30"
              min="5"
              max="300"
              class="ext-glass-input"
              style="width:60px; text-align:center;"
            />
            <span style="font-size:11px; color:var(--muted-strong, #6b7d91);">s</span>
          </div>
        </div>
      </details>
    </div>

  `;
}
