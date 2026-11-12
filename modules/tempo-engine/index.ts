import { requireOptionalNativeModule } from 'expo-modules-core';
export type EngineInfo = { baseUrl: string; engine: string };
type EngineModule = { start: () => Promise<EngineInfo>; stop: () => Promise<void> };
export default requireOptionalNativeModule<EngineModule>('TempoEngine');
