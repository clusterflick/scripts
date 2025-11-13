const Persister = require("@pollyjs/persister");
const fs = require("fs-extra");
const path = require("path");

/**
 * A custom Polly.js persister that chunks HAR files into multiple smaller files.
 * This is useful for recordings with many entries that would otherwise create
 * very large single files.
 */
class ChunkedFsPersister extends Persister {
  static get id() {
    return "chunked-fs";
  }

  get defaultOptions() {
    return {
      recordingsDir: path.join(process.cwd(), "recordings"),
      maxEntries: 250, // Maximum entries per chunk file
    };
  }

  /**
   * Returns the directory path for a recording's chunks
   */
  getRecordingDir(recordingId) {
    return path.join(this.options.recordingsDir, recordingId);
  }

  /**
   * Returns the path for a specific chunk file
   */
  getChunkFilename(recordingId, chunkIndex) {
    return path.join(
      this.getRecordingDir(recordingId),
      `recording-chunk-${chunkIndex}.har`,
    );
  }

  /**
   * Returns the path for the metadata file
   */
  getMetadataFilename(recordingId) {
    return path.join(this.getRecordingDir(recordingId), "metadata.json");
  }

  /**
   * Returns the path for the legacy single-file recording
   */
  getLegacyFilename(recordingId) {
    return path.join(this.getRecordingDir(recordingId), "recording.har");
  }

  /**
   * Finds and loads a recording by reading all chunk files and merging them.
   * Falls back to legacy single-file format if chunks are not found.
   */
  async onFindRecording(recordingId) {
    const recordingDir = this.getRecordingDir(recordingId);
    const metadataFile = this.getMetadataFilename(recordingId);
    const legacyFile = this.getLegacyFilename(recordingId);

    // Check if the recording directory exists
    if (!fs.existsSync(recordingDir)) {
      return null;
    }

    try {
      // Check for legacy single-file format first
      if (fs.existsSync(legacyFile) && !fs.existsSync(metadataFile)) {
        // Read and return the legacy single-file recording
        return fs.readJsonSync(legacyFile);
      }

      // Check for chunked format
      if (!fs.existsSync(metadataFile)) {
        return null;
      }

      // Read metadata
      const metadata = fs.readJsonSync(metadataFile);

      // Read all chunk files
      const allEntries = [];
      for (let i = 0; i < metadata.chunkCount; i++) {
        const chunkFile = this.getChunkFilename(recordingId, i);
        if (fs.existsSync(chunkFile)) {
          const chunk = fs.readJsonSync(chunkFile);
          allEntries.push(...chunk.log.entries);
        }
      }

      // Return the merged HAR structure
      return {
        log: {
          creator: metadata.creator,
          _recordingName: metadata._recordingName,
          entries: allEntries,
        },
      };
    } catch (error) {
      this.polly.logger.log.error("Error reading chunked recording:", error);
      return null;
    }
  }

  /**
   * Saves a recording by splitting it into chunks
   */
  async onSaveRecording(recordingId, data) {
    const recordingDir = this.getRecordingDir(recordingId);
    const maxEntries = this.options.maxEntries;

    try {
      // Ensure the recording directory exists
      fs.ensureDirSync(recordingDir);

      const entries = data.log.entries;
      const chunkCount = Math.ceil(entries.length / maxEntries);

      // Save metadata
      const metadata = {
        creator: data.log.creator,
        _recordingName: data.log._recordingName,
        chunkCount,
        totalEntries: entries.length,
        maxEntries,
      };
      fs.outputJsonSync(this.getMetadataFilename(recordingId), metadata, {
        spaces: 2,
      });

      // Split entries into chunks and save each chunk
      for (let i = 0; i < chunkCount; i++) {
        const startIdx = i * maxEntries;
        const endIdx = Math.min(startIdx + maxEntries, entries.length);
        const chunkEntries = entries.slice(startIdx, endIdx);

        const chunkData = {
          log: {
            creator: data.log.creator,
            _recordingName: data.log._recordingName,
            entries: chunkEntries,
          },
        };

        fs.outputJsonSync(this.getChunkFilename(recordingId, i), chunkData, {
          spaces: 2,
        });
      }

      // Clean up any old chunks that are no longer needed
      let chunkIndex = chunkCount;
      while (fs.existsSync(this.getChunkFilename(recordingId, chunkIndex))) {
        fs.removeSync(this.getChunkFilename(recordingId, chunkIndex));
        chunkIndex++;
      }
    } catch (error) {
      this.polly.logger.log.error("Error saving chunked recording:", error);
      throw error;
    }
  }

  /**
   * Deletes a recording by removing all chunk files and the directory
   */
  async onDeleteRecording(recordingId) {
    const recordingDir = this.getRecordingDir(recordingId);

    if (fs.existsSync(recordingDir)) {
      fs.removeSync(recordingDir);
    }
  }
}

module.exports = ChunkedFsPersister;
