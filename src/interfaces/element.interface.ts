/**
 * UI element and accessibility types for SnapDrive MCP Server
 */

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface AccessibilityElement {
  label?: string;
  value?: string;
  type?: string;
  role?: string;
  roleDescription?: string;
  identifier?: string;
  frame: Frame;
  enabled: boolean;
  traits?: string[];
  children?: AccessibilityElement[];
}

export interface UITree {
  elements: AccessibilityElement[];
  timestamp: string;
  screenSize?: { width: number; height: number };
}

export type MatchType = 'label' | 'labelContains' | 'type' | 'role' | 'predicate';

export interface ElementPredicate {
  label?: string | RegExp;
  labelContains?: string;
  type?: string;
  role?: string;
  enabled?: boolean;
}

export interface ElementSearchResult {
  found: boolean;
  element?: AccessibilityElement;
  elements: AccessibilityElement[];
  count: number;
  tapCoordinates?: Point;
}
