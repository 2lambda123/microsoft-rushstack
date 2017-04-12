/**
 * Here is some documentation for example2.
 * @remarks These are additional remarks that may be too long for the summary.
 * They should appear in the remarks of the json generated file for this package.
 */
declare const packageDescription: void;

export {
    TestMissingCommentStar,
    IExternalPackageLookupInheritDoc,
    inheritDisplayMode,
    packageLocatedButExportNotFound,
    inheritDisplayModeError,
    inheritDisplayModeErrorDeprecated,
    inheritDisplayModeNoErrorDeprecated,
    functionWithIncompleteReturnType,
    functionWithIncompleteParameterType,
    IncompleteTypeConstructor
} from './MyDocumentedClass';
export { default as MyDocumentedClass } from './MyDocumentedClass';