export interface DashGroup {
  /** Heading of the group (sidebar only); the first group has none. */
  label?: string;
  items: DashItem[];
}

export interface DashItem {
  label: string;
  path: string;
  icon: string;
  /** A quiet number at the end of the row (sidebar only); undefined while it is not known. */
  count?: number;
  /** What the number counts, read out after the label: "11 saved titles". */
  countLabel?: string;
}
