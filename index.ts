import { setRuntime } from "./runtime.js";
import { xmtpPlugin } from "./channel.js";

export default function register(api: any) {
  setRuntime(api.runtime);
  api.registerChannel({ plugin: xmtpPlugin });
}
