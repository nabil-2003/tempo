import Engine from '@/modules/tempo-engine';
let starting: Promise<string> | undefined;
export function startEmbeddedEngine(): Promise<string> | undefined {
  if (!Engine) return undefined;
  if (!starting) {
    starting = Engine.start().then(info => info.baseUrl).catch(error => { starting = undefined; throw error; });
  }
  return starting;
}
