/**
 * React Native CLI Configuration
 *
 * Desativa o codegen da New Architecture para @dr.pogodin/react-native-fs
 * porque a spec TurboModule dele (NativeReactNativeFs.ts) tem tipos
 * incompatíveis com o codegen do RN 0.76 (onDownloadBegin como TSTypeReference).
 *
 * A lib continua funcionando via Old Architecture (bridge).
 * Para reverter: deletar este arquivo OU remover a entrada de @dr.pogodin/react-native-fs.
 */
module.exports = {
  dependencies: {
    '@dr.pogodin/react-native-fs': {
      platforms: {
        android: {
          libraryName: null,
          componentDescriptors: null,
          cmakeListsPath: null,
          cxxModuleCMakeListsModuleName: null,
          cxxModuleCMakeListsPath: null,
          cxxModuleHeaderName: null,
        },
      },
    },
  },
};
