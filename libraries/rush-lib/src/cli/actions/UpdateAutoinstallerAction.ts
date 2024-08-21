// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRequiredCommandLineStringParameter } from '@rushstack/ts-command-line';
import type { ITerminal } from '@rushstack/terminal';

import { BaseRushAction } from './BaseRushAction';
import type { RushCommandLineParser } from '../RushCommandLineParser';
import { Autoinstaller } from '../../logic/Autoinstaller';

export class UpdateAutoinstallerAction extends BaseRushAction {
  private readonly _name: IRequiredCommandLineStringParameter;
  private readonly _terminal: ITerminal;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'update-autoinstaller',
      summary: 'Updates autoinstaller package dependencies',
      documentation: 'Use this command to regenerate the shrinkwrap file for an autoinstaller folder.',
      parser
    });

    this._name = this.defineStringParameter({
      parameterLongName: '--name',
      argumentName: 'AUTOINSTALLER_NAME',
      required: true,
      description:
        'Specifies the name of the autoinstaller, which must be one of the folders under common/autoinstallers.'
    });

    this._terminal = parser.terminal;
  }

  protected async runAsync(): Promise<void> {
    const autoinstallerName: string = this._name.value;
    const autoinstaller: Autoinstaller = new Autoinstaller({
      autoinstallerName,
      rushConfiguration: this.rushConfiguration,
      rushGlobalFolder: this.rushGlobalFolder
    });

    // Do not run `autoinstaller.prepareAsync` here. It tries to install the autoinstaller with
    // --frozen-lockfile or equivalent, which will fail if the autoinstaller's dependencies
    // have been changed.

    await autoinstaller.updateAsync();

    this._terminal.writeLine('\nSuccess.');
  }
}
