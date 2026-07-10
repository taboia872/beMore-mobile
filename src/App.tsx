import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import DownloadScreen from './screens/DownloadScreen';

export default function App() {
  useEffect(() => {
    // Esconde a status bar completamente no mount
    StatusBar.setHidden(true, 'none');
    return () => {
      // Restaura ao desmontar (fallback)
      StatusBar.setHidden(false, 'none');
    };
  }, []);

  return (
    <>
      <StatusBar hidden translucent barStyle="light-content" backgroundColor="#08080c" />
      <DownloadScreen />
    </>
  );
}
