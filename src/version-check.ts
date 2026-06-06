export function checkVersionCompat(cliVersion: string, pluginVersion: string | undefined): void {
  if (!pluginVersion) return;

  const [cliMajor, cliMinor] = cliVersion.split('.');
  const [pluginMajor, pluginMinor] = pluginVersion.split('.');

  if (cliMajor !== pluginMajor || cliMinor !== pluginMinor) {
    process.stderr.write(
      `Warning: smithue-cli version ${cliVersion} does not match plugin version ${pluginVersion}. Run "smithue-cli upgrade" to update.\n`,
    );
  }
}
