/**
 * Element finder - search and locate UI elements
 */

import type {
  AccessibilityElement,
  Point,
  ElementSearchResult,
  ElementPredicate,
} from '../interfaces/element.interface.js';

export interface IElementFinder {
  findByLabel(elements: AccessibilityElement[], label: string): AccessibilityElement[];
  findByLabelContains(elements: AccessibilityElement[], partial: string): AccessibilityElement[];
  findByType(elements: AccessibilityElement[], type: string): AccessibilityElement[];
  findByRole(elements: AccessibilityElement[], role: string): AccessibilityElement[];
  findByPredicate(
    elements: AccessibilityElement[],
    predicate: ElementPredicate
  ): AccessibilityElement[];
  findBest(
    elements: AccessibilityElement[],
    predicate: ElementPredicate,
    screenCenter?: Point
  ): ElementSearchResult;
  getCenterPoint(element: AccessibilityElement): Point;
  getAllLabels(elements: AccessibilityElement[]): string[];
  findScrollRegion(elements: AccessibilityElement[]): { centerX: number; centerY: number } | null;
}

export class ElementFinder implements IElementFinder {
  /**
   * Find elements with exact label match
   */
  findByLabel(elements: AccessibilityElement[], label: string): AccessibilityElement[] {
    return elements.filter((el) => el.label === label);
  }

  /**
   * Find elements with partial label match
   */
  findByLabelContains(elements: AccessibilityElement[], partial: string): AccessibilityElement[] {
    const lowerPartial = partial.toLowerCase();
    return elements.filter((el) => el.label?.toLowerCase().includes(lowerPartial));
  }

  /**
   * Find elements by type
   */
  findByType(elements: AccessibilityElement[], type: string): AccessibilityElement[] {
    const lowerType = type.toLowerCase();
    return elements.filter((el) => el.type?.toLowerCase() === lowerType);
  }

  /**
   * Find elements by role
   */
  findByRole(elements: AccessibilityElement[], role: string): AccessibilityElement[] {
    const lowerRole = role.toLowerCase();
    return elements.filter((el) => el.role?.toLowerCase().includes(lowerRole));
  }

  /**
   * Find elements matching a predicate
   */
  findByPredicate(
    elements: AccessibilityElement[],
    predicate: ElementPredicate
  ): AccessibilityElement[] {
    return elements.filter((el) => this.matchesPredicate(el, predicate));
  }

  /**
   * Find the best matching element and return search result with tap coordinates
   */
  findBest(
    elements: AccessibilityElement[],
    predicate: ElementPredicate,
    screenCenter: Point = { x: 200, y: 400 }
  ): ElementSearchResult {
    const matches = this.findByPredicate(elements, predicate);

    if (matches.length === 0) {
      return {
        found: false,
        elements: [],
        count: 0,
      };
    }

    // Rank and sort matches
    const ranked = this.rankElements(matches, screenCenter);
    const best = ranked[0]!;

    return {
      found: true,
      element: best,
      elements: ranked,
      count: ranked.length,
      tapCoordinates: this.getCenterPoint(best),
    };
  }

  /**
   * Calculate center point of element's frame
   */
  getCenterPoint(element: AccessibilityElement): Point {
    return {
      x: Math.round(element.frame.x + element.frame.width / 2),
      y: Math.round(element.frame.y + element.frame.height / 2),
    };
  }

  /**
   * Get all labels from elements (for debugging/suggestions)
   */
  getAllLabels(elements: AccessibilityElement[]): string[] {
    const labels = new Set<string>();
    for (const el of elements) {
      if (el.label) {
        labels.add(el.label);
      }
    }
    return Array.from(labels).sort();
  }

  /**
   * Check if element matches predicate
   */
  private matchesPredicate(el: AccessibilityElement, pred: ElementPredicate): boolean {
    // Check label (exact match or regex)
    if (pred.label !== undefined) {
      if (pred.label instanceof RegExp) {
        if (!el.label || !pred.label.test(el.label)) {
          return false;
        }
      } else {
        if (el.label !== pred.label) {
          return false;
        }
      }
    }

    // Check labelContains
    if (pred.labelContains !== undefined) {
      if (!el.label?.toLowerCase().includes(pred.labelContains.toLowerCase())) {
        return false;
      }
    }

    // Check type
    if (pred.type !== undefined) {
      if (el.type?.toLowerCase() !== pred.type.toLowerCase()) {
        return false;
      }
    }

    // Check role
    if (pred.role !== undefined) {
      if (!el.role?.toLowerCase().includes(pred.role.toLowerCase())) {
        return false;
      }
    }

    // Check enabled
    if (pred.enabled !== undefined) {
      if (el.enabled !== pred.enabled) {
        return false;
      }
    }

    return true;
  }

  /**
   * Rank elements by priority:
   * 1. Buttons and tappable elements first
   * 2. Enabled elements before disabled
   * 3. Closer to screen center
   */
  private rankElements(
    elements: AccessibilityElement[],
    screenCenter: Point
  ): AccessibilityElement[] {
    return [...elements].sort((a, b) => {
      // Priority 1: Button-like elements
      const aIsButton = this.isButtonLike(a);
      const bIsButton = this.isButtonLike(b);
      if (aIsButton && !bIsButton) return -1;
      if (!aIsButton && bIsButton) return 1;

      // Priority 2: Enabled elements
      if (a.enabled && !b.enabled) return -1;
      if (!a.enabled && b.enabled) return 1;

      // Priority 3: Closer to screen center
      const aDistance = this.distanceToCenter(a, screenCenter);
      const bDistance = this.distanceToCenter(b, screenCenter);
      return aDistance - bDistance;
    });
  }

  /**
   * Check if element is button-like (more likely to be tappable)
   */
  private isButtonLike(el: AccessibilityElement): boolean {
    const buttonTypes = ['button', 'link', 'tab', 'cell'];
    const type = el.type?.toLowerCase() ?? '';
    const role = el.role?.toLowerCase() ?? '';

    return (
      buttonTypes.some((t) => type.includes(t) || role.includes(t)) ||
      el.traits?.some((t) => t.toLowerCase().includes('button')) === true
    );
  }

  /**
   * Calculate distance from element center to screen center
   */
  private distanceToCenter(el: AccessibilityElement, screenCenter: Point): number {
    const center = this.getCenterPoint(el);
    const dx = center.x - screenCenter.x;
    const dy = center.y - screenCenter.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Find the best scroll region by analyzing element frames
   * Returns center point of the largest container that likely contains scrollable content
   */
  findScrollRegion(elements: AccessibilityElement[]): { centerX: number; centerY: number } | null {
    // Default fallback
    const defaultCenter = { centerX: 200, centerY: 400 };

    if (elements.length === 0) {
      return defaultCenter;
    }

    // Find container elements (Group, etc.) that could be scroll containers
    const containerTypes = ['group', 'axgroup', 'scrollview', 'tableview', 'collectionview', 'list'];

    const containers = elements.filter((el) => {
      const type = el.type?.toLowerCase() ?? '';
      const role = el.role?.toLowerCase() ?? '';
      return containerTypes.some(t => type.includes(t) || role.includes(t));
    });

    // If we found containers, find the largest one that's not at the very top
    // (to avoid navigation bars which are usually at y < 100)
    let bestContainer: AccessibilityElement | null = null;
    let maxArea = 0;

    const candidateContainers = containers.length > 0 ? containers : elements;

    for (const el of candidateContainers) {
      const frame = el.frame;
      if (!frame) continue;

      // Skip elements that are likely navigation bars (at very top)
      if (frame.y < 50 && frame.height < 100) continue;

      // Skip elements that are likely tab bars (at very bottom, small height)
      if (frame.y > 700 && frame.height < 100) continue;

      // Skip very small elements
      if (frame.width < 100 || frame.height < 100) continue;

      const area = frame.width * frame.height;
      if (area > maxArea) {
        maxArea = area;
        bestContainer = el;
      }
    }

    if (bestContainer && bestContainer.frame) {
      const frame = bestContainer.frame;
      return {
        centerX: Math.round(frame.x + frame.width / 2),
        centerY: Math.round(frame.y + frame.height / 2),
      };
    }

    // Fallback: calculate center from all element bounds
    let minY = Infinity, maxY = 0;
    let avgX = 0;
    let count = 0;

    for (const el of elements) {
      if (!el.frame) continue;
      const frame = el.frame;

      // Skip likely navigation/tab bars
      if (frame.y < 50 && frame.height < 100) continue;
      if (frame.y > 700 && frame.height < 100) continue;

      minY = Math.min(minY, frame.y);
      maxY = Math.max(maxY, frame.y + frame.height);
      avgX += frame.x + frame.width / 2;
      count++;
    }

    if (count > 0) {
      return {
        centerX: Math.round(avgX / count),
        centerY: Math.round((minY + maxY) / 2),
      };
    }

    return defaultCenter;
  }
}

export const elementFinder = new ElementFinder();
