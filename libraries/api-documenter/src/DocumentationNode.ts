// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ApiItem,
  IApiItemReference
} from '@microsoft/api-extractor';

export class DocumentationNode {
  public readonly docItem: ApiItem;
  public readonly name: string;
  public readonly parent: DocumentationNode | undefined;
  private _docId: string|undefined = undefined;

  // TODO: This is not really correct.  We need to validate that the referenced object
  // actually exists, and avoid creating a broken link if not.
  public static getDocIdForCodeLink(codeLink: Partial<IApiItemReference>): string {
    let result: string = '';
    if (codeLink.packageName) {
      result += codeLink.packageName;
      if (codeLink.exportName) {
        result += '.' + codeLink.packageName;
        if (codeLink.memberName) {
          result += '.' + codeLink.memberName;
        }
      }
    }
    return result.toLowerCase();
  }

  constructor(docItem: ApiItem, name: string, parent: DocumentationNode | undefined) {
    this.docItem = docItem;
    this.name = name;
    this.parent = parent;
  }

  /**
   * A documentation ID is a string that  uniquely identifies an object in
   * the API documentation web site, and is used e.g. for creating internal hyperlinks.
   */
  public get docId(): string {
    if (!this._docId) {
      let result: string = '';
      if (this.parent) {
        result = this.parent.docId + '.';
      }

      if (this.name === '__constructor') {
        result += '-ctor';
      } else {
        result += this.name.toLowerCase();
      }

      this._docId = result;
    }
    return this._docId;
  }

  // This is a temporary workaround until the DocumentationNode class is replaced by DocItem
  public getApiReference(): IApiItemReference {
    const result: string[] = [];
    for (let current: DocumentationNode | undefined = this; current; current = current.parent) {
      result.unshift(current.name);
    }
    result.push('', '', '');

    return {
      scopeName: '',
      packageName: result[0],
      exportName: result[1],
      memberName: result[2]
    };
  }
}
