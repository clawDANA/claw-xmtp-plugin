let _runtime: any = null;

export function setRuntime(rt: any) {
  _runtime = rt;
}

export function getRuntime(): any {
  if (!_runtime) throw new Error("[xmtp] runtime not initialized");
  return _runtime;
}
