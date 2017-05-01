import MyClass from './MyClass';

/**
 * This is a test for the namespace API type. It should be supported 
 * and appear in the *api.ts file. At the moment we only support 
 * a table of primitive types.
 * 
 * @public
 */
export namespace NamespaceExport {
  /**
   * String constants are supported
   */
  export const stringConstant1: string = '\uED68';
  /**
   * Number constants are supported
   */
  export const numberConstant1: number = 24;
  /**
   * Boolean constants are supported
   */
  export const booleanConstant1: boolean = true;
  /**
   * Complex types are not supported
   */
  export const complexType1: {} = {key1: 'value1', key2: 'value2'};

  /**
   * This field should be const but it is not exported 
   * so it should not raise a warning. 
   */
  let _prop: string = 'will not incur warning';

  /**
   * This field should incur a warning because it does 
   * not have the const modifier.
   */
  export let propTwo: string = 'warning missing const';

  /**
   * Classes are not supported, warning should be shown.
   */
  export class ClassesNotAllowed {
  }

  /**
   * This is a test for interfaces in a namespace. 
   */
  export interface InterfacesNotAllowed {
  }

  /**
   * This is a test for a function in a namespace.
   * @param value - this is a description for the param. 
   */
  export function aFunctionNotAllowed(value: number): void {
  }
}
 