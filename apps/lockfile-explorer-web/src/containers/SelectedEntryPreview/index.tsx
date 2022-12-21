// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback } from 'react';
import styles from './styles.scss';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  addBookmark,
  forwardStack,
  popStack,
  removeBookmark,
  selectCurrentEntry
} from '../../store/slices/entrySlice';

export const SelectedEntryPreview = (): JSX.Element => {
  const selectedEntry = useAppSelector(selectCurrentEntry);
  const isBookmarked = useAppSelector((state) =>
    selectedEntry ? state.entry.bookmarkedEntries.includes(selectedEntry) : false
  );

  const entryStack = useAppSelector((state) => state.entry.selectedEntryStack);
  const entryForwardStack = useAppSelector((state) => state.entry.selectedEntryForwardStack);
  const useDispatch = useAppDispatch();

  const bookmark = useCallback(() => {
    if (selectedEntry) useDispatch(addBookmark(selectedEntry));
  }, [selectedEntry]);
  const deleteEntry = useCallback(() => {
    if (selectedEntry) useDispatch(removeBookmark(selectedEntry));
  }, [selectedEntry]);

  const pop = useCallback(() => {
    useDispatch(popStack());
  }, []);
  const forward = useCallback(() => {
    useDispatch(forwardStack());
  }, []);

  const renderButtonRow = (): JSX.Element => {
    return (
      <div className={styles.NavigationButtonRow}>
        <button disabled={entryStack.length <= 1} onClick={pop}>
          Back
        </button>
        <button disabled={entryForwardStack.length === 0} onClick={forward}>
          Forward
        </button>
        {isBookmarked ? (
          <button onClick={deleteEntry} disabled={!selectedEntry}>
            Remove&nbsp;Bookmark
          </button>
        ) : (
          <button onClick={bookmark} disabled={!selectedEntry}>
            Add&nbsp;Bookmark
          </button>
        )}
      </div>
    );
  };

  if (!selectedEntry) {
    return (
      <div className={styles.SelectedEntryCard}>
        <div className={styles.SelectedEntryBookmarkRow}>
          <h5>No Entry Selected</h5>
          {renderButtonRow()}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.SelectedEntryCard}>
      <div className={styles.SelectedEntryBookmarkRow}>
        <div className={styles.SelectedEntryHeader}>
          <h5>Selected entry:</h5>
          <span>{selectedEntry.displayText}</span>
        </div>
        {renderButtonRow()}
      </div>
      <div>
        <p>Package Entry: {selectedEntry.rawEntryId}</p>
        <p>Package JSON path: {selectedEntry.packageJsonFolderPath}</p>
      </div>
    </div>
  );
};
