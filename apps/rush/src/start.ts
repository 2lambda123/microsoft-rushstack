// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import * as semver from 'semver';

import { Logging } from '@microsoft/node-core-library';

const nodeVersion: string = process.versions.node;

// tslint:disable-next-line

// We are on an ancient version of NodeJS that is known not to work with Rush
if (semver.satisfies(nodeVersion, '<= 6.4.0')) {
  Logging.error(colors.red(`Your version of Node.js (${nodeVersion}) is very old and incompatible with Rush.`
    + ` Please upgrade to the latest Long-Term Support (LTS) version.`));
  process.exit(1);
}

// We are on a much newer release than we have tested and support
// tslint:disable-next-line
else if (semver.satisfies(nodeVersion, '>=9.0.0')) {
  Logging.warn(colors.yellow(`Your version of Node.js (${nodeVersion}) has not been tested with this release of Rush.`
    + ` The Rush team will not accept issue reports for it.`
    + ` Please consider upgrading Rush or downgrading Node.js.`));
}

// We are not on an LTS release
// tslint:disable-next-line
else if (!semver.satisfies(nodeVersion, '^6.9.0')
      && !semver.satisfies(nodeVersion, '^8.9.0')) {
  Logging.warn(colors.yellow(`Your version of Node.js (${nodeVersion}) is not a Long-Term Support (LTS) release.`
    + ` These versions frequently contain bugs, and the Rush team will not accept issue reports for them.`
    + ` Please consider installing a stable release.`));
}

import * as path from 'path';
import { JsonFile, IPackageJson } from '@microsoft/node-core-library';

import { Rush, EnvironmentVariableNames } from '@microsoft/rush-lib';

import { MinimalRushConfiguration } from './MinimalRushConfiguration';
import { RushVersionSelector } from './RushVersionSelector';

// Load the configuration
const configuration: MinimalRushConfiguration | undefined = MinimalRushConfiguration.loadFromDefaultLocation();
const currentPackageJson: IPackageJson = JsonFile.load(path.join(__dirname, '..', 'package.json'));

let rushVersionToLoad: string | undefined = undefined;

const previewVersion: string | undefined = process.env[EnvironmentVariableNames.RUSH_PREVIEW_VERSION];

function padEnd(s: string, length: number): string {
  let result: string = s;
  while (result.length < length) {
    result += ' ';
  }
  return result;
}

if (previewVersion) {
  if (!semver.valid(previewVersion, false)) {
    Logging.error(colors.red(`Invalid value for RUSH_PREVIEW_VERSION environment variable: "${previewVersion}"`));
    process.exit(1);
  }

  rushVersionToLoad = previewVersion;

  const lines: string[] = [];
  lines.push(
    `*********************************************************************`,
    `* WARNING! THE "RUSH_PREVIEW_VERSION" ENVIRONMENT VARIABLE IS SET.  *`,
    `*                                                                   *`,
    `* You are previewing Rush version:        ${padEnd(previewVersion, 25)} *`
  );

  if (configuration) {
    lines.push(
      `* The rush.json configuration asks for:   ${padEnd(configuration.rushVersion, 25)} *`
    );
  }

  lines.push(
    `*                                                                   *`,
    `* To restore the normal behavior, unset the RUSH_PREVIEW_VERSION    *`,
    `* environment variable.                                             *`,
    `*********************************************************************`
  );

  Logging.error(lines
    .map(line => colors.black(colors.bgYellow(line)))
    .join(os.EOL));

} else if (configuration) {
  rushVersionToLoad = configuration.rushVersion;
}

// If we are previewing an older Rush that doesn't understand the RUSH_PREVIEW_VERSION variable,
// then unset it.
if (rushVersionToLoad && semver.lt(rushVersionToLoad, '5.0.0-dev.18')) {
  delete process.env[EnvironmentVariableNames.RUSH_PREVIEW_VERSION];
}

// If we're inside a repo folder, and it's requesting a different version, then use the RushVersionManager to
// install it
if (rushVersionToLoad && rushVersionToLoad !== currentPackageJson.version) {
  const versionSelector: RushVersionSelector = new RushVersionSelector(currentPackageJson.version);
  versionSelector.ensureRushVersionInstalled(rushVersionToLoad)
    .catch((error: Error) => {
      Logging.log(colors.red('Error: ' + error.message));
    });
} else {
  // Otherwise invoke the rush-lib that came with this rush package

  // Rush is "managed" if its version and configuration are dictated by a repo's rush.json
  const isManaged: boolean = !!configuration;

  Rush.launch(currentPackageJson.version, isManaged);
}
