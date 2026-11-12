const { withAndroidManifest, withDangerousMod, withGradleProperties } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const mainConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>`;
const debugConfig = mainConfig.replace('  </domain-config>', '    <domain includeSubdomains="false">10.0.2.2</domain>\n  </domain-config>');
module.exports = config => {
  config = withAndroidManifest(config, c => {
    c.modResults.manifest.application[0].$['android:extractNativeLibs'] = 'true';
    c.modResults.manifest.application[0].$['android:networkSecurityConfig'] = '@xml/tempo_network_security_config';
    return c;
  });
  config = withGradleProperties(config, c => {
    for (const [key, value] of [['expo.useLegacyPackaging', 'true'], ['reactNativeArchitectures', 'arm64-v8a,x86_64']]) {
      c.modResults = c.modResults.filter(p => p.key !== key);
      c.modResults.push({ type: 'property', key, value });
    }
    return c;
  });
  return withDangerousMod(config, ['android', c => {
    for (const [source, content] of [['main', mainConfig], ['debug', debugConfig]]) {
      const directory = path.join(c.modRequest.platformProjectRoot, 'app/src', source, 'res/xml');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'tempo_network_security_config.xml'), content);
    }
    return c;
  }]);
};
