import * as fs from "fs";
import * as path from "path";

import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import {
  AnalysisConfig,
  AnalysisKind,
  CodeQuality,
  CodeScanning,
} from "./analyses";
import { getRunnerLogger } from "./logging";
import { createFeatures, setupTests } from "./testing-utils";
import { UploadResult } from "./upload-lib";
import * as uploadLib from "./upload-lib";
import { findAndUpload, uploadSarif, UploadSarifResults } from "./upload-sarif";
import * as util from "./util";

setupTests(test);

const findAndUploadMacro = test.macro({
  exec: async (
    t: ExecutionContext<unknown>,
    sarifFiles: string[],
    analysis: AnalysisConfig,
    sarifPath: (tempDir: string) => string = (tempDir) => tempDir,
    expectedResult: UploadResult | undefined,
  ) => {
    await util.withTmpDir(async (tempDir) => {
      sinon.stub(uploadLib, "uploadSpecifiedFiles").resolves(expectedResult);
      const logger = getRunnerLogger(true);
      const features = createFeatures([]);

      for (const sarifFile of sarifFiles) {
        fs.writeFileSync(path.join(tempDir, sarifFile), "");
      }

      const stats = fs.statSync(sarifPath(tempDir));
      const actual = await findAndUpload(
        logger,
        features,
        sarifPath(tempDir),
        stats,
        "",
        analysis,
      );

      t.deepEqual(actual, expectedResult);
    });
  },
  title: (providedTitle = "") => `findAndUpload - ${providedTitle}`,
});

test(
  "no matching files",
  findAndUploadMacro,
  ["test.json"],
  CodeScanning,
  undefined,
  undefined,
);

test(
  "matching files for Code Scanning with directory path",
  findAndUploadMacro,
  ["test.sarif"],
  CodeScanning,
  undefined,
  {
    statusReport: {},
    sarifID: "some-id",
  },
);

test(
  "matching files for Code Scanning with file path",
  findAndUploadMacro,
  ["test.sarif"],
  CodeScanning,
  (tempDir) => path.join(tempDir, "test.sarif"),
  {
    statusReport: {},
    sarifID: "some-id",
  },
);

const uploadSarifMacro = test.macro({
  exec: async (
    t: ExecutionContext<unknown>,
    sarifFiles: string[],
    sarifPath: (tempDir: string) => string = (tempDir) => tempDir,
    expectedResult: UploadSarifResults,
  ) => {
    await util.withTmpDir(async (tempDir) => {
      const logger = getRunnerLogger(true);
      const testPath = sarifPath(tempDir);
      const features = createFeatures([]);
      const uploadSpecifiedFiles = sinon.stub(
        uploadLib,
        "uploadSpecifiedFiles",
      );

      for (const analysisKind of Object.keys(expectedResult)) {
        uploadSpecifiedFiles
          .withArgs(
            sinon.match.any,
            sinon.match.any,
            sinon.match.any,
            features,
            logger,
            analysisKind === AnalysisKind.CodeScanning
              ? CodeScanning
              : CodeQuality,
          )
          .resolves(expectedResult[analysisKind as AnalysisKind]);
      }

      for (const sarifFile of sarifFiles) {
        fs.writeFileSync(path.join(tempDir, sarifFile), "");
      }

      const stats = fs.statSync(testPath);
      const actual = await uploadSarif(logger, features, testPath, stats, "");

      t.deepEqual(actual, expectedResult);
    });
  },
  title: (providedTitle = "") => `uploadSarif - ${providedTitle}`,
});

test(
  "SARIF file",
  uploadSarifMacro,
  ["test.sarif"],
  (tempDir) => path.join(tempDir, "test.sarif"),
  {
    "code-scanning": {
      statusReport: {},
      sarifID: "code-scanning-sarif",
    },
  },
);

test(
  "JSON file",
  uploadSarifMacro,
  ["test.json"],
  (tempDir) => path.join(tempDir, "test.json"),
  {
    "code-scanning": {
      statusReport: {},
      sarifID: "code-scanning-sarif",
    },
  },
);

test(
  "Code Scanning files",
  uploadSarifMacro,
  ["test.json", "test.sarif"],
  undefined,
  {
    "code-scanning": {
      statusReport: {},
      sarifID: "code-scanning-sarif",
    },
  },
);

test(
  "Code Quality file",
  uploadSarifMacro,
  ["test.quality.sarif"],
  (tempDir) => path.join(tempDir, "test.quality.sarif"),
  {
    "code-quality": {
      statusReport: {},
      sarifID: "code-quality-sarif",
    },
  },
);

test(
  "Mixed files",
  uploadSarifMacro,
  ["test.sarif", "test.quality.sarif"],
  undefined,
  {
    "code-scanning": {
      statusReport: {},
      sarifID: "code-scanning-sarif",
    },
    "code-quality": {
      statusReport: {},
      sarifID: "code-quality-sarif",
    },
  },
);
