const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const customConfig = {
  resolver: {
    assetExts: [...defaultConfig.resolver.assetExts, 'gguf', 'onnx'],
  },
};

module.exports = mergeConfig(defaultConfig, customConfig);
