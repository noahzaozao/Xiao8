import nativeStorage from './nativeStorage';
import type { Storage } from './types';

/**
 * React Native 环境的存储实现
 * 使用 @react-native-async-storage/async-storage
 */
const storage: Storage = nativeStorage;

export default storage;
export type { Storage };

