// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as argparse from 'argparse';

import { CommandLineAction } from './CommandLineAction';
import { CommandLineParameterKind, type CommandLineParameter } from '../parameters/BaseClasses';
import type { ICommandLineParserData } from './CommandLineParameterProvider';
import type { ICommandLineParserOptions } from './CommandLineParser';
import type { CommandLineChoiceParameter } from '../parameters/CommandLineChoiceParameter';
import type { CommandLineFlagParameter } from '../parameters/CommandLineFlagParameter';
import type { CommandLineStringParameter } from '../parameters/CommandLineStringParameter';
import type { CommandLineIntegerParameter } from '../parameters/CommandLineIntegerParameter';
import type { CommandLineChoiceListParameter } from '../parameters/CommandLineChoiceListParameter';
import type { CommandLineIntegerListParameter } from '../parameters/CommandLineIntegerListParameter';

/**
 * Options for the AliasCommandLineAction constructor.
 * @public
 */
export interface IAliasCommandLineActionOptions {
  /**
   * The name of your tool when invoked from the command line. Used for generating help text.
   */
  toolFilename: string;

  /**
   * The name of the alias.  For example, if the tool is called "example",
   * then the "build" alias might be invoked as: "example build -q --some-other-option"
   */
  aliasName: string;

  /**
   * A list of default parameters to pass to the target action.
   */
  defaultParameters?: string[];

  /**
   * The action that this alias invokes.
   */
  targetAction: CommandLineAction;
}

/**
 * Represents a sub-command that is part of the CommandLineParser command line.
 * The sub-command is an alias for another existing action.
 *
 * The alias name should be comprised of lower case words separated by hyphens
 * or colons. The name should include an English verb (e.g. "deploy"). Use a
 * hyphen to separate words (e.g. "upload-docs").
 *
 * @public
 */
export class AliasCommandLineAction extends CommandLineAction {
  /**
   * The action that this alias invokes.
   */
  public readonly targetAction: CommandLineAction;

  /**
   * A list of default arguments to pass to the target action.
   */
  public readonly defaultParameters: ReadonlyArray<string>;

  private _parameterKeyMap: Map<string, string> = new Map<string, string>();

  public constructor(options: IAliasCommandLineActionOptions) {
    const toolFilename: string = options.toolFilename;
    const targetActionName: string = options.targetAction.actionName;
    const defaultParametersString: string = (options.defaultParameters || []).join(' ');
    const summary: string = `An alias for "${toolFilename} ${targetActionName}${
      defaultParametersString ? ` ${defaultParametersString}` : ''
    }".`;

    super({
      actionName: options.aliasName,
      summary,
      documentation:
        `${summary} For more information on the aliased command, use ` +
        `"${toolFilename} ${targetActionName} --help".`
    });

    this.targetAction = options.targetAction;
    this.defaultParameters = options.defaultParameters || [];
  }

  /** @internal */
  public _registerDefinedParameters(): void {
    /* override */
    // All parameters are going to be defined by the target action. Re-use the target action parameters
    // for this action.
    for (const parameter of this.targetAction.parameters) {
      let aliasParameter: CommandLineParameter;
      const nameOptions: { parameterLongName: string; parameterShortName: string | undefined } = {
        parameterLongName: parameter.longName,
        parameterShortName: parameter.shortName
      };
      switch (parameter.kind) {
        case CommandLineParameterKind.Choice:
          const choiceParameter: CommandLineChoiceParameter = parameter as CommandLineChoiceParameter;
          aliasParameter = this.defineChoiceParameter({
            ...nameOptions,
            ...choiceParameter,
            alternatives: ([] as string[]).concat(choiceParameter.alternatives)
          });
          break;
        case CommandLineParameterKind.ChoiceList:
          const choiceListParameter: CommandLineChoiceListParameter =
            parameter as CommandLineChoiceListParameter;
          aliasParameter = this.defineChoiceListParameter({
            ...nameOptions,
            ...choiceListParameter,
            alternatives: ([] as string[]).concat(choiceListParameter.alternatives)
          });
          break;
        case CommandLineParameterKind.Flag:
          const flagParameter: CommandLineFlagParameter = parameter as CommandLineFlagParameter;
          aliasParameter = this.defineFlagParameter({ ...nameOptions, ...flagParameter });
          break;
        case CommandLineParameterKind.Integer:
          const integerParameter: CommandLineIntegerParameter = parameter as CommandLineIntegerParameter;
          aliasParameter = this.defineIntegerParameter({ ...nameOptions, ...integerParameter });
          break;
        case CommandLineParameterKind.IntegerList:
          const integerListParameter: CommandLineIntegerListParameter =
            parameter as CommandLineIntegerListParameter;
          aliasParameter = this.defineIntegerListParameter({ ...nameOptions, ...integerListParameter });
          break;
        case CommandLineParameterKind.String:
          const stringParameter: CommandLineStringParameter = parameter as CommandLineStringParameter;
          aliasParameter = this.defineStringParameter({ ...nameOptions, ...stringParameter });
          break;
        case CommandLineParameterKind.StringList:
          const stringListParameter: CommandLineStringParameter = parameter as CommandLineStringParameter;
          aliasParameter = this.defineStringListParameter({ ...nameOptions, ...stringListParameter });
          break;
        default:
          throw new Error(`Unsupported parameter kind: ${parameter.kind}`);
      }
      // We know the parserKey is defined because the underlying _defineParameter method sets it,
      // and all parameters that we have access to have already been defined.
      this._parameterKeyMap.set(aliasParameter._parserKey!, parameter._parserKey!);
    }

    // We also need to register the remainder parameter if the target action has one. The parser
    // key for this parameter is constant.
    if (this.targetAction.remainder) {
      this.defineCommandLineRemainder(this.targetAction.remainder);
      this._parameterKeyMap.set(argparse.Const.REMAINDER, argparse.Const.REMAINDER);
    }

    // Finally, register the parameters with the parser.
    super._registerDefinedParameters();
  }

  /**
   * This is called internally by CommandLineParser.execute()
   * @internal
   */
  public _processParsedData(parserOptions: ICommandLineParserOptions, data: ICommandLineParserData): void {
    // Re-map the parsed data to the target action's parameters and execute the target action processor.
    const targetData: ICommandLineParserData = {
      action: this.targetAction.actionName,
      aliasAction: data.action,
      aliasDocumentation: this.documentation
    };
    for (const [key, value] of Object.entries(data)) {
      // If we have a mapping for the specified key, then use it. Otherwise, use the key as-is.
      // Skip over the action key though, since we've already re-mapped it to "aliasAction"
      if (key === 'action') {
        continue;
      }
      const targetKey: string | undefined = this._parameterKeyMap.get(key);
      targetData[targetKey ?? key] = value;
    }
    this.targetAction._processParsedData(parserOptions, targetData);
  }

  /**
   * Executes the target action.
   */
  protected async onExecute(): Promise<void> {
    await this.targetAction._execute();
  }
}
