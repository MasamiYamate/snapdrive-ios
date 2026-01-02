/**
 * HTML Report Generator for test results
 * Generates self-contained HTML with embedded base64 images
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRunResult, TestCaseResult, CheckpointResult } from '../interfaces/scenario.interface.js';
import type { ILogger } from '../utils/logger.js';
import { Logger } from '../utils/logger.js';

export interface IReportGenerator {
  generateReport(result: TestRunResult): Promise<string>;
}

export class ReportGenerator implements IReportGenerator {
  private logger: ILogger;
  private logoDataUri: string | null = null;

  constructor(logger?: ILogger) {
    this.logger = logger ?? new Logger('report-generator');
  }

  /**
   * Load logo image as base64 data URI
   */
  private async getLogoDataUri(): Promise<string | null> {
    if (this.logoDataUri !== null) {
      return this.logoDataUri;
    }

    try {
      // Get the path to the logo relative to this source file
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const logoPath = join(__dirname, '../../docs/images/logo.png');

      if (!existsSync(logoPath)) {
        this.logger.debug(`Logo not found: ${logoPath}`);
        this.logoDataUri = '';
        return null;
      }

      const buffer = await readFile(logoPath);
      this.logoDataUri = `data:image/png;base64,${buffer.toString('base64')}`;
      return this.logoDataUri;
    } catch (error) {
      this.logger.debug(`Failed to load logo: ${error}`);
      this.logoDataUri = '';
      return null;
    }
  }

  /**
   * Generate HTML report for test results
   */
  async generateReport(result: TestRunResult): Promise<string> {
    const reportPath = `${result.resultsDir}/report.html`;
    const html = await this.buildHtml(result);

    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, html, 'utf-8');

    this.logger.info(`Report generated: ${reportPath}`);
    return reportPath;
  }

  /**
   * Read image file and convert to base64 data URI
   */
  private async imageToDataUri(imagePath: string): Promise<string | null> {
    try {
      if (!existsSync(imagePath)) {
        this.logger.debug(`Image not found: ${imagePath}`);
        return null;
      }
      const buffer = await readFile(imagePath);
      const base64 = buffer.toString('base64');
      return `data:image/png;base64,${base64}`;
    } catch (error) {
      this.logger.debug(`Failed to read image: ${imagePath}`, { error: String(error) });
      return null;
    }
  }

  private async buildHtml(result: TestRunResult): Promise<string> {
    const passRate = result.totalTests > 0 ? ((result.passed / result.totalTests) * 100).toFixed(1) : '0';

    // Load logo
    const logoDataUri = await this.getLogoDataUri();

    // Build test case HTML with embedded images
    const testCasesHtml: string[] = [];
    for (const tc of result.results) {
      const tcHtml = await this.buildTestCaseHtml(tc);
      testCasesHtml.push(tcHtml);
    }

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SnapDrive Test Report - ${result.runId}</title>
  <style>
    :root {
      --color-pass: #22c55e;
      --color-fail: #ef4444;
      --color-bg: #f8fafc;
      --color-card: #ffffff;
      --color-border: #e2e8f0;
      --color-text: #1e293b;
      --color-text-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.5;
      padding: 2rem;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    .report-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .report-logo {
      height: 40px;
      width: auto;
    }
    h1 { font-size: 1.5rem; margin: 0; }
    h2 { font-size: 1.25rem; margin-bottom: 0.75rem; }
    h3 { font-size: 1rem; margin-bottom: 0.5rem; }
    h4 { font-size: 0.875rem; margin-bottom: 0.5rem; color: var(--color-text-muted); }
    .summary {
      background: var(--color-card);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    .summary-item {
      text-align: center;
      padding: 1rem;
      background: var(--color-bg);
      border-radius: 6px;
    }
    .summary-item .value { font-size: 2rem; font-weight: 700; }
    .summary-item .label { color: var(--color-text-muted); font-size: 0.875rem; }
    .summary-item.pass .value { color: var(--color-pass); }
    .summary-item.fail .value { color: var(--color-fail); }
    .test-case {
      background: var(--color-card);
      border-radius: 8px;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .test-case-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--color-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .test-case-header.pass { border-left: 4px solid var(--color-pass); }
    .test-case-header.fail { border-left: 4px solid var(--color-fail); }
    .badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge.pass { background: #dcfce7; color: #166534; }
    .badge.fail { background: #fee2e2; color: #991b1b; }
    .test-case-body { padding: 1.5rem; }
    .steps { margin-bottom: 1.5rem; }
    .step {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--color-border);
    }
    .step:last-child { border-bottom: none; }
    .step-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      flex-shrink: 0;
    }
    .step-icon.pass { background: #dcfce7; color: #166534; }
    .step-icon.fail { background: #fee2e2; color: #991b1b; }
    .step-action {
      font-family: monospace;
      background: var(--color-bg);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
    }
    .step-error {
      color: var(--color-fail);
      font-size: 0.75rem;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .step-duration {
      color: var(--color-text-muted);
      font-size: 0.75rem;
      margin-left: auto;
      flex-shrink: 0;
    }
    .checkpoints { margin-top: 1rem; }
    .checkpoint {
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: var(--color-bg);
      border-radius: 6px;
    }
    .checkpoint-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .diff-percent { font-weight: 600; }
    .diff-percent.pass { color: var(--color-pass); }
    .diff-percent.fail { color: var(--color-fail); }
    .screenshot-compare {
      display: flex;
      flex-direction: row;
      gap: 1rem;
      overflow-x: auto;
      padding-bottom: 0.5rem;
    }
    .screenshot-item {
      flex: 1 1 0;
      min-width: 200px;
      max-width: 400px;
      text-align: center;
    }
    .screenshot-item img {
      width: 100%;
      height: auto;
      border: 3px solid var(--color-border);
      border-radius: 4px;
      cursor: pointer;
      transition: transform 0.2s, border-color 0.2s;
    }
    .screenshot-item img:hover {
      transform: scale(1.02);
      border-color: #3b82f6;
    }
    .screenshot-item.diff img { border-color: var(--color-fail); }
    .screenshot-item.actual img { border-color: #3b82f6; }
    .screenshot-item.baseline img { border-color: #22c55e; }
    .screenshot-label {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: var(--color-text-muted);
      font-weight: 600;
    }
    .no-image {
      padding: 3rem 1rem;
      color: var(--color-text-muted);
      background: #f1f5f9;
      border-radius: 4px;
      font-size: 0.875rem;
    }
    .meta {
      color: var(--color-text-muted);
      font-size: 0.875rem;
      margin-top: 1rem;
    }
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.95);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      flex-direction: column;
    }
    .modal.active { display: flex; }
    .modal img {
      max-width: 95%;
      max-height: 90%;
      object-fit: contain;
    }
    .modal-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      color: white;
      font-size: 2rem;
      cursor: pointer;
      background: none;
      border: none;
      width: 48px;
      height: 48px;
    }
    .modal-label {
      color: white;
      margin-top: 1rem;
      font-size: 0.875rem;
    }
    /* Full page checkpoint styles */
    .full-page-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      background: #dbeafe;
      color: #1e40af;
      border-radius: 4px;
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      margin-left: 0.5rem;
      vertical-align: middle;
    }
    .scroll-segments {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--color-border);
    }
    .scroll-segments h5 {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin-bottom: 0.75rem;
    }
    .segments-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 0.75rem;
    }
    .segment-item {
      text-align: center;
    }
    .segment-item img {
      width: 100%;
      height: auto;
      border: 2px solid var(--color-border);
      border-radius: 4px;
      cursor: pointer;
      transition: transform 0.2s, border-color 0.2s;
    }
    .segment-item img:hover {
      transform: scale(1.05);
      border-color: #3b82f6;
    }
    .segment-label {
      margin-top: 0.25rem;
      font-size: 0.625rem;
      color: var(--color-text-muted);
    }
    /* Route simulation checkpoint styles */
    .route-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      background: #fef3c7;
      color: #92400e;
      border-radius: 4px;
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      margin-left: 0.5rem;
      vertical-align: middle;
    }
    .waypoints-section {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--color-border);
    }
    .waypoints-section h5 {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin-bottom: 0.75rem;
    }
    .waypoints-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .waypoint-comparison {
      background: #fffbeb;
      border: 1px solid #fbbf24;
      border-radius: 6px;
      padding: 0.75rem;
    }
    .waypoint-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .waypoint-title {
      font-weight: 600;
      font-size: 0.875rem;
      color: #92400e;
    }
    .waypoint-status {
      font-size: 0.75rem;
      font-weight: 600;
    }
    .waypoint-status.pass { color: var(--color-pass); }
    .waypoint-status.fail { color: var(--color-fail); }
    .waypoint-images {
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
    }
    .waypoint-img-item {
      flex: 1 1 0;
      min-width: 100px;
      max-width: 200px;
      text-align: center;
    }
    .waypoint-img-item img {
      width: 100%;
      height: auto;
      border: 2px solid var(--color-border);
      border-radius: 4px;
      cursor: pointer;
      transition: transform 0.2s, border-color 0.2s;
    }
    .waypoint-img-item img:hover {
      transform: scale(1.02);
      border-color: #f59e0b;
    }
    .waypoint-img-label {
      margin-top: 0.25rem;
      font-size: 0.625rem;
      color: var(--color-text-muted);
    }
    .waypoint-img-placeholder {
      padding: 2rem 0.5rem;
      color: var(--color-text-muted);
      background: #f1f5f9;
      border-radius: 4px;
      font-size: 0.75rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="report-header">
      ${logoDataUri ? `<img src="${logoDataUri}" alt="SnapDrive" class="report-logo">` : ''}
      <h1>Test Report</h1>
    </div>

    <div class="summary">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="summary-item">
          <div class="value">${result.totalTests}</div>
          <div class="label">Total Tests</div>
        </div>
        <div class="summary-item pass">
          <div class="value">${result.passed}</div>
          <div class="label">Passed</div>
        </div>
        <div class="summary-item fail">
          <div class="value">${result.failed}</div>
          <div class="label">Failed</div>
        </div>
        <div class="summary-item">
          <div class="value">${passRate}%</div>
          <div class="label">Pass Rate</div>
        </div>
        <div class="summary-item">
          <div class="value">${(result.durationMs / 1000).toFixed(1)}s</div>
          <div class="label">Duration</div>
        </div>
      </div>
      <div class="meta">
        Run ID: ${this.escapeHtml(result.runId)}<br>
        Started: ${result.startTime}<br>
        Ended: ${result.endTime}
      </div>
    </div>

    <h2>Test Cases</h2>
    ${testCasesHtml.join('\n')}
  </div>

  <div class="modal" id="imageModal" onclick="closeModal()">
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <img id="modalImage" src="" alt="Full size screenshot">
    <div class="modal-label" id="modalLabel"></div>
  </div>

  <script>
    function openModal(src, label) {
      document.getElementById('modalImage').src = src;
      document.getElementById('modalLabel').textContent = label || '';
      document.getElementById('imageModal').classList.add('active');
    }
    function closeModal() {
      document.getElementById('imageModal').classList.remove('active');
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  </script>
</body>
</html>`;
  }

  private async buildTestCaseHtml(tc: TestCaseResult): Promise<string> {
    const statusClass = tc.success ? 'pass' : 'fail';

    // Build checkpoints HTML with embedded images
    let checkpointsHtml = '';
    if (tc.checkpoints.length > 0) {
      const cpHtmlParts: string[] = [];
      for (const cp of tc.checkpoints) {
        const cpHtml = await this.buildCheckpointHtml(cp);
        cpHtmlParts.push(cpHtml);
      }
      checkpointsHtml = `
        <div class="checkpoints">
          <h4>Screenshot Checkpoints</h4>
          ${cpHtmlParts.join('\n')}
        </div>`;
    }

    return `
    <div class="test-case">
      <div class="test-case-header ${statusClass}">
        <div>
          <h3>${this.escapeHtml(tc.testCaseName)}</h3>
          <span class="meta">${this.escapeHtml(tc.testCaseId)} - ${(tc.durationMs / 1000).toFixed(2)}s</span>
        </div>
        <span class="badge ${statusClass}">${tc.success ? 'PASS' : 'FAIL'}</span>
      </div>
      <div class="test-case-body">
        <div class="steps">
          <h4>Steps (${tc.steps.length})</h4>
          ${tc.steps
            .map(
              (step, idx) => `
            <div class="step">
              <span class="step-icon ${step.success ? 'pass' : 'fail'}">${step.success ? '✓' : '✗'}</span>
              <span class="step-action">${idx + 1}. ${step.action}</span>
              ${step.error ? `<span class="step-error">${this.escapeHtml(step.error.slice(0, 100))}</span>` : ''}
              <span class="step-duration">${step.duration}ms</span>
            </div>
          `
            )
            .join('')}
        </div>
        ${checkpointsHtml}
      </div>
    </div>`;
  }

  private async buildCheckpointHtml(cp: CheckpointResult): Promise<string> {
    // Load images as base64 data URIs
    const [actualDataUri, baselineDataUri, diffDataUri] = await Promise.all([
      this.imageToDataUri(cp.actualPath),
      this.imageToDataUri(cp.baselinePath),
      cp.diffPath ? this.imageToDataUri(cp.diffPath) : Promise.resolve(null),
    ]);

    const buildImageHtml = (dataUri: string | null, label: string, cssClass: string): string => {
      const noImageMsg = label === 'Baseline' ? 'Baseline not found' : (label === 'Diff' ? 'No differences' : 'No image');
      if (!dataUri) {
        return `
          <div class="screenshot-item ${cssClass}">
            <div class="no-image">${noImageMsg}</div>
            <div class="screenshot-label">${label}</div>
          </div>`;
      }
      return `
        <div class="screenshot-item ${cssClass}">
          <img src="${dataUri}" alt="${label}" onclick="openModal(this.src, '${this.escapeHtml(cp.name)} - ${label}')">
          <div class="screenshot-label">${label}</div>
        </div>`;
    };

    // Build scroll segments section if this is a full-page checkpoint
    let segmentsHtml = '';
    if (cp.isFullPage && cp.segmentPaths && cp.segmentPaths.length > 1) {
      const segmentDataUris = await Promise.all(
        cp.segmentPaths.map(p => this.imageToDataUri(p))
      );

      const segmentItems = segmentDataUris
        .map((dataUri, idx) => {
          if (!dataUri) return '';
          return `
            <div class="segment-item">
              <img src="${dataUri}" alt="Segment ${idx + 1}" onclick="openModal(this.src, '${this.escapeHtml(cp.name)} - Segment ${idx + 1}')">
              <div class="segment-label">Segment ${idx + 1}</div>
            </div>`;
        })
        .join('');

      segmentsHtml = `
        <div class="scroll-segments">
          <h5>Scroll Segments (${cp.segmentPaths.length})</h5>
          <div class="segments-grid">
            ${segmentItems}
          </div>
        </div>`;
    }

    // Build waypoints section if this is a route simulation checkpoint
    let waypointsHtml = '';
    if (cp.isRouteSimulation && cp.waypointResults && cp.waypointResults.length > 0) {
      const waypointItemsHtml: string[] = [];

      for (const wp of cp.waypointResults) {
        const [wpActualUri, wpBaselineUri, wpDiffUri] = await Promise.all([
          this.imageToDataUri(wp.actualPath),
          this.imageToDataUri(wp.baselinePath),
          wp.diffPath ? this.imageToDataUri(wp.diffPath) : Promise.resolve(null),
        ]);

        const statusClass = wp.match ? 'pass' : 'fail';
        const statusIcon = wp.match ? '✓' : '✗';
        const diffText = `${wp.differencePercent.toFixed(1)}%`;

        const buildWpImageHtml = (dataUri: string | null, label: string): string => {
          if (!dataUri) {
            return `<div class="waypoint-img-placeholder">${label === 'Baseline' ? 'No baseline' : 'No image'}</div>`;
          }
          return `<img src="${dataUri}" alt="${label}" onclick="openModal(this.src, '${this.escapeHtml(cp.name)} - Waypoint ${wp.index + 1} ${label}')">`;
        };

        waypointItemsHtml.push(`
          <div class="waypoint-comparison">
            <div class="waypoint-header">
              <span class="waypoint-title">Waypoint ${wp.index + 1}</span>
              <span class="waypoint-status ${statusClass}">${statusIcon} ${diffText}</span>
            </div>
            <div class="waypoint-images">
              <div class="waypoint-img-item">
                ${buildWpImageHtml(wpActualUri, 'Actual')}
                <div class="waypoint-img-label">Actual</div>
              </div>
              <div class="waypoint-img-item">
                ${buildWpImageHtml(wpBaselineUri, 'Baseline')}
                <div class="waypoint-img-label">Baseline</div>
              </div>
              <div class="waypoint-img-item">
                ${buildWpImageHtml(wpDiffUri, 'Diff')}
                <div class="waypoint-img-label">Diff</div>
              </div>
            </div>
          </div>`);
      }

      waypointsHtml = `
        <div class="waypoints-section">
          <h5>Route Waypoints (${cp.waypointResults.length})</h5>
          <div class="waypoints-list">
            ${waypointItemsHtml.join('')}
          </div>
        </div>`;
    }

    const fullPageBadge = cp.isFullPage ? '<span class="full-page-badge">Full Page</span>' : '';
    const routeBadge = cp.isRouteSimulation ? '<span class="route-badge">Route</span>' : '';

    return `
      <div class="checkpoint">
        <div class="checkpoint-header">
          <strong>${this.escapeHtml(cp.name)}</strong> ${fullPageBadge}${routeBadge}
          <span class="diff-percent ${cp.match ? 'pass' : 'fail'}">
            ${cp.match ? `✓ Match (${cp.differencePercent.toFixed(2)}%)` : `✗ ${cp.differencePercent.toFixed(2)}% different`}
          </span>
        </div>
        <div class="screenshot-compare">
          ${buildImageHtml(actualDataUri, 'Actual', 'actual')}
          ${buildImageHtml(baselineDataUri, 'Baseline', 'baseline')}
          ${buildImageHtml(diffDataUri, 'Diff', 'diff')}
        </div>
        ${segmentsHtml}
        ${waypointsHtml}
      </div>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
