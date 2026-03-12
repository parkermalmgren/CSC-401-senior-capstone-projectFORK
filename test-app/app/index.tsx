import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function Index() {
  const injectedCSS = `
    /* Dark mode ONLY for login page */
    body:has([href="/signup"]) section,
    body:has([href="/signup"]) { 
      background-color: #1a1a1a !important;
    }
    body:has([href="/signup"]) .bg-gray-50 {
      background-color: #1a1a1a !important;
    }
    body:has([href="/signup"]) h1,
    body:has([href="/signup"]) label,
    body:has([href="/signup"]) span,
    body:has([href="/signup"]) p {
      color: #ffffff !important;
    }
    body:has([href="/signup"]) .text-gray-700,
    body:has([href="/signup"]) .text-gray-600,
    body:has([href="/signup"]) .text-gray-800 {
      color: #ffffff !important;
    }
    body:has([href="/signup"]) input[type="email"],
    body:has([href="/signup"]) input[type="password"],
    body:has([href="/signup"]) input[type="checkbox"] {
      background-color: #2d2d2d !important;
      border-color: #444444 !important;
      color: #ffffff !important;
    }
    body:has([href="/signup"]) .bg-white {
      background-color: #2d2d2d !important;
      border-color: #444444 !important;
    }
    body:has([href="/signup"]) .bg-white:hover {
      background-color: #3d3d3d !important;
    }
  `;

  return (
    <View style={styles.container}>
      <WebView 
        source={{ uri: 'https://smart-pantry-psi.vercel.app/login' }}
        style={styles.webview}
        startInLoadingState={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        cacheEnabled={false}
        incognito={true}
        injectedJavaScript={`
          setTimeout(() => {
            const style = document.createElement('style');
            style.innerHTML = \`${injectedCSS}\`;
            document.head.appendChild(style);
          }, 100);
          true;
        `}
        onMessage={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});
