function setXmlAttribute(openingTag, attribute, value) {
  const expression = new RegExp(`\\sandroid:${attribute}="[^"]*"`);
  const replacement = ` android:${attribute}="${value}"`;
  return expression.test(openingTag)
    ? openingTag.replace(expression, replacement)
    : openingTag.replace(/>$/, `${replacement}>`);
}

export function configureAndroidManifest(manifest) {
  const applicationExpression = /<application\b[^>]*>/;
  if (!applicationExpression.test(manifest)) {
    throw new Error('No se encontró application en AndroidManifest.xml. Regenera el proyecto nativo con Capacitor.');
  }

  let configured = manifest.replace(applicationExpression, (openingTag) => {
    let secured = setXmlAttribute(openingTag, 'allowBackup', 'false');
    secured = setXmlAttribute(secured, 'fullBackupContent', 'false');
    secured = setXmlAttribute(secured, 'dataExtractionRules', '@xml/data_extraction_rules');
    secured = setXmlAttribute(secured, 'usesCleartextTraffic', 'false');
    secured = setXmlAttribute(secured, 'networkSecurityConfig', '@xml/network_security_config');
    return secured;
  });

  const mainActivityExpression = /<activity\b(?=[^>]*\bandroid:name="\.MainActivity")[^>]*>/;
  if (!mainActivityExpression.test(configured)) {
    throw new Error('No se encontró MainActivity en AndroidManifest.xml. Regenera el proyecto nativo con Capacitor.');
  }

  configured = configured.replace(mainActivityExpression, (openingTag) =>
    setXmlAttribute(openingTag, 'windowSoftInputMode', 'adjustResize'),
  );
  return configured;
}
