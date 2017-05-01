// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction, CommandLineFlagParameter } from '@microsoft/ts-command-line';
import { RushConfiguration } from '@microsoft/rush-lib';

import RushCommandLineParser from './RushCommandLineParser';
import LinkManager from '../utilities/LinkManager';

export default class LinkAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfiguration: RushConfiguration;
  private _force: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'link',
      summary: 'Create node_modules symlinks for all projects',
      documentation: 'Create node_modules symlinks for all projects'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    this._force = this.defineFlagParameter({
      parameterLongName: '--force',
      parameterShortName: '-f',
      description: 'Forces deleting and recreating links, even if the filesystem'
        + ' state seems to indicate that this is unnecessary.'
    });
  }

  protected onExecute(): void {
    this._rushConfiguration = this._rushConfiguration = RushConfiguration.loadFromDefaultLocation();

    const linkManager: LinkManager = new LinkManager(this._rushConfiguration);
    linkManager.execute(this._force.value);
  }
}
