import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import StrandApp from './src/StrandApp';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#f4efe7" />
      <StrandApp />
    </SafeAreaProvider>
  );
}

export default App;
