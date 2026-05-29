import type { ChannelsStatusSnapshot, TeamProjectSummary } from "../types";
import type {
  ChannelRouteAgentOption,
  ChannelRouteEntry,
  ChannelRouteProjectOption,
} from "../views/channels.types";
import type { ChannelsState } from "./channels.types";

export type { ChannelsState };

export async function loadChannels(state: ChannelsState, probe: boolean) {
  console.log(
    "[channels] loadChannels called, probe=",
    probe,
    "client=",
    !!state.client,
    "connected=",
    state.connected,
    "loading=",
    state.channelsLoading,
  );
  if (!state.client || !state.connected) {
    console.warn("[channels] BAIL: client=", !!state.client, "connected=", state.connected);
    return;
  }
  if (state.channelsLoading) {
    console.warn("[channels] BAIL: already loading");
    return;
  }
  state.channelsLoading = true;
  state.channelsError = null;
  try {
    console.log("[channels] sending channels.status request...");
    const res = (await state.client.request("channels.status", {
      probe,
      timeoutMs: 8000,
    })) as ChannelsStatusSnapshot;
    const feishuAccounts = res?.channelAccounts?.feishu ?? [];
    console.log("[channels] channels.status OK, feishu accounts=", feishuAccounts.length);
    for (const a of feishuAccounts) {
      console.log(
        "[channels] feishu account:",
        JSON.stringify({
          accountId: a.accountId,
          configured: a.configured,
          enabled: a.enabled,
          running: a.running,
          lastError: a.lastError,
          probe: a.probe,
        }),
      );
    }
    console.log("[channels] feishu channel summary:", JSON.stringify(res?.channels?.feishu));
    state.channelsSnapshot = res;
    state.channelsLastSuccess = Date.now();
  } catch (err) {
    console.error("[channels] channels.status FAILED:", err);
    state.channelsError = String(err);
  } finally {
    state.channelsLoading = false;
    console.log("[channels] loadChannels done, error=", state.channelsError);
  }
}

export async function startWhatsAppLogin(state: ChannelsState, force: boolean) {
  if (!state.client || !state.connected || state.whatsappBusy) return;
  state.whatsappBusy = true;
  try {
    const res = (await state.client.request("web.login.start", {
      force,
      timeoutMs: 30000,
    })) as { message?: string; qrDataUrl?: string };
    state.whatsappLoginMessage = res.message ?? null;
    state.whatsappLoginQrDataUrl = res.qrDataUrl ?? null;
    state.whatsappLoginConnected = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
    state.whatsappLoginQrDataUrl = null;
    state.whatsappLoginConnected = null;
  } finally {
    state.whatsappBusy = false;
  }
}

export async function waitWhatsAppLogin(state: ChannelsState) {
  if (!state.client || !state.connected || state.whatsappBusy) return;
  state.whatsappBusy = true;
  try {
    const res = (await state.client.request("web.login.wait", {
      timeoutMs: 120000,
    })) as { connected?: boolean; message?: string };
    state.whatsappLoginMessage = res.message ?? null;
    state.whatsappLoginConnected = res.connected ?? null;
    if (res.connected) state.whatsappLoginQrDataUrl = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
    state.whatsappLoginConnected = null;
  } finally {
    state.whatsappBusy = false;
  }
}

export async function logoutWhatsApp(state: ChannelsState) {
  if (!state.client || !state.connected || state.whatsappBusy) return;
  state.whatsappBusy = true;
  try {
    await state.client.request("channels.logout", { channel: "whatsapp" });
    state.whatsappLoginMessage = "Logged out.";
    state.whatsappLoginQrDataUrl = null;
    state.whatsappLoginConnected = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
  } finally {
    state.whatsappBusy = false;
  }
}

// ── Channel Route Binding ─────────────────────────────────────────────

export async function loadChannelRoutes(state: ChannelsState) {
  if (!state.client || !state.connected) return;
  try {
    const [routeRes, projectRes, agentsRes, agentRoutesRes] = await Promise.all([
      state.client.request("team.route.summary", {}) as Promise<
        | {
            routes: ChannelRouteEntry[];
          }
        | undefined
      >,
      state.client.request("team.project.list", {}) as Promise<
        | {
            projects: TeamProjectSummary[];
          }
        | undefined
      >,
      state.client.request("agents.list", {}) as Promise<
        | {
            agents: Array<{ id: string; name?: string }>;
            defaultId?: string;
          }
        | undefined
      >,
      state.client.request("route.getChannelAgents", {}) as Promise<
        | {
            routes: ChannelRouteEntry[];
          }
        | undefined
      >,
    ]);
    // Merge project routes and direct agent routes into one summary
    const projectRoutes = routeRes?.routes ?? [];
    const agentRoutes = agentRoutesRes?.routes ?? [];
    state.channelRouteSummary = [...projectRoutes, ...agentRoutes];
    state.channelRouteProjects =
      projectRes?.projects?.map(
        (p): ChannelRouteProjectOption => ({
          projectId: p.projectId,
          name: p.name,
          supervisorId: p.supervisorId,
          bindings: p.bindings,
          description: p.description,
          status: p.status,
          memberCount: p.memberCount,
          memberIds: p.memberIds,
        }),
      ) ?? [];
    // Filter out agents that belong to a team project (supervisors + members)
    // so the dropdown only shows independent agents and team projects.
    const teamMemberIds = new Set<string>();
    for (const p of state.channelRouteProjects) {
      if (p.supervisorId) teamMemberIds.add(p.supervisorId);
      if (p.memberIds) {
        for (const id of p.memberIds) teamMemberIds.add(id);
      }
    }
    state.channelRouteAgents =
      agentsRes?.agents
        ?.filter((a) => !teamMemberIds.has(a.id))
        .map(
          (a): ChannelRouteAgentOption => ({
            agentId: a.id,
            name: a.name || a.id,
          }),
        ) ?? [];
  } catch {
    // Route data is non-critical; silently ignore failures
  }
}

export async function updateChannelRoute(
  state: ChannelsState,
  channel: string,
  accountId: string | undefined,
  targetId: string | null,
  targetType: "project" | "agent",
) {
  if (!state.client || !state.connected || state.channelRouteSaving) return;
  state.channelRouteSaving = true;
  try {
    const projects = state.channelRouteProjects ?? [];

    // Always remove existing project bindings for this channel/account
    for (const proj of projects) {
      const bindings = proj.bindings ?? [];
      const hasBinding = bindings.some(
        (b) => b.channel === channel && (accountId ? b.accountId === accountId : !b.accountId),
      );
      if (hasBinding) {
        const newBindings = bindings.filter(
          (b) => !(b.channel === channel && (accountId ? b.accountId === accountId : !b.accountId)),
        );
        await state.client.request("team.project.update", {
          projectId: proj.projectId,
          bindings: newBindings,
        });
      }
    }

    // Always clear any existing direct agent binding for this channel/account
    await state.client.request("route.setChannelAgent", {
      channel,
      ...(accountId ? { accountId } : {}),
      agentId: null,
    });

    // Set the new binding
    if (targetId) {
      if (targetType === "project") {
        const targetProject = projects.find((p) => p.projectId === targetId);
        if (targetProject) {
          const cleanedBindings = (targetProject.bindings ?? []).filter(
            (b) =>
              !(b.channel === channel && (accountId ? b.accountId === accountId : !b.accountId)),
          );
          const newBinding = {
            channel,
            ...(accountId ? { accountId } : {}),
          };
          await state.client.request("team.project.update", {
            projectId: targetId,
            bindings: [...cleanedBindings, newBinding],
          });
          // Also create a direct agent binding for the project's supervisor
          // so that resolveAgentRoute() can route messages to the supervisor,
          // which then dispatches to team members via resolve_agent hook.
          if (targetProject.supervisorId) {
            await state.client.request("route.setChannelAgent", {
              channel,
              ...(accountId ? { accountId } : {}),
              agentId: targetProject.supervisorId,
            });
          }
        }
      } else {
        // targetType === "agent"
        await state.client.request("route.setChannelAgent", {
          channel,
          ...(accountId ? { accountId } : {}),
          agentId: targetId,
        });
      }
    }

    // Restart the channel so it picks up the new binding config.
    // The feishu monitor captures `cfg` at startup; without restart,
    // resolveAgentRoute() uses stale config and ignores new bindings.
    try {
      await state.client.request("channels.restart", {
        channel,
        ...(accountId ? { accountId } : {}),
      });
    } catch {
      // Non-fatal — channel may still pick up changes via config cache expiry
    }

    // Reload route data
    await loadChannelRoutes(state);

    // Show "saved" hint for 2 seconds
    state.channelRouteSavedHint = true;
    setTimeout(() => {
      state.channelRouteSavedHint = false;
    }, 2000);
  } catch {
    // Best effort
  } finally {
    state.channelRouteSaving = false;
  }
}
