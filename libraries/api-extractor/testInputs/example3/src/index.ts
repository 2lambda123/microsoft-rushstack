/**
 * This example folder is used to test the functionality of DocItemLoader and API reference resolution.
 */
declare const packageDescription: void;

export {
    inheritLocalOptionOne,
    inheritLocalOptionTwoFunction,
    inheritEnumValues,
    sourceEnumValuesDoc,
    inheritLocalCircularDependencyOne,
    inheritLocalCircularDependencyTwo,
    jsonResolutionFunction,
    jsonResolutionClass,
    IStructuredTypeInherit,
    IStructuredTypeSource,
    testingLinks,
    publicEnum,
    internalEnum as _internalEnum
} from './MyClass';
export { default as MyClass } from './MyClass';