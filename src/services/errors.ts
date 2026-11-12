import { Alert } from 'react-native';
export const reportError = (error: unknown) => Alert.alert('Tempo', error instanceof Error ? error.message : String(error));
