import type { GatewayBrowserClient } from "../gateway";
import type { ChannelsStatusSnapshot } from "../types";
import type {
  ChannelRouteAgentOption,
  ChannelRouteEntry,
  ChannelRouteProjectOption,
} from "../views/channels.types";

export type ChannelsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  channelsLoading: boolean;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsError: string | null;
  channelsLastSuccess: number | null;
  whatsappLoginMessage: string | null;
  whatsappLoginQrDataUrl: string | null;
  whatsappLoginConnected: boolean | null;
  whatsappBusy: boolean;
  // Channel route binding state
  channelRouteSummary: ChannelRouteEntry[] | null;
  channelRouteProjects: ChannelRouteProjectOption[] | null;
  channelRouteAgents: ChannelRouteAgentOption[] | null;
  channelRouteSaving: boolean;
  channelRouteSavedHint: boolean;
};
