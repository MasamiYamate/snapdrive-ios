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
  hasScrollableView(elements: AccessibilityElement[]): boolean;
  findScrollableViews(elements: AccessibilityElement[]): AccessibilityElement[];
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
   * Check if any element in the list is a scrollable view
   */
  hasScrollableView(elements: AccessibilityElement[]): boolean {
    return this.findScrollableViews(elements).length > 0;
  }

  /**
   * Find all scrollable view elements
   * Detects: UIScrollView, UITableView, UICollectionView, and similar
   */
  findScrollableViews(elements: AccessibilityElement[]): AccessibilityElement[] {
    const scrollableTypes = [
      'scrollview',
      'tableview',
      'collectionview',
      'uiscrollview',
      'uitableview',
      'uicollectionview',
      'list',
      'scroll',
    ];

    const scrollableTraits = [
      'scrollable',
    ];

    return elements.filter((el) => {
      const type = el.type?.toLowerCase() ?? '';
      const role = el.role?.toLowerCase() ?? '';
      const traits = el.traits?.map(t => t.toLowerCase()) ?? [];

      // Check type
      if (scrollableTypes.some(t => type.includes(t))) {
        return true;
      }

      // Check role
      if (scrollableTypes.some(t => role.includes(t))) {
        return true;
      }

      // Check traits
      if (traits.some(t => scrollableTraits.some(st => t.includes(st)))) {
        return true;
      }

      return false;
    });
  }
}

export const elementFinder = new ElementFinder();
