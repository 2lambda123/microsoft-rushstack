// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * api-extractor-test-05
 *
 * This project tests various documentation generation scenarios and
 * doc comment syntaxes.
 *
 * @packageDocumentation
 */

export * from './DocClass1';
export * from './DocEnums';

/**
 * A type alias
 * @public
 */
export type ExampleTypeAlias = Promise<boolean>;

/**
 * An exported variable declaration.
 * @public
 */
export const constVariable: number = 123;

/**
 * An exported function
 * @public
 */
export function globalFunction(x: number): number {
  return x;
}

/**
 * A top-level namespace
 * @public
 */
export namespace OuterNamespace {
  /**
   * A nested namespace
   */
  export namespace InnerNamespace {
    /**
     * A function inside a namespace
     */
    export function nestedFunction(x: number): number {
      return x;
    }
  }

  /**
   * A variable exported from within a namespace.
   */
  export let nestedVariable: boolean = false;
}
