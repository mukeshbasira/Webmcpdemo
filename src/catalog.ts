export type ItemType = keyof typeof CATALOG

export const CATALOG = {
  sofa:         { w: 210, h: 90,  label: 'Sofa',         seat: true, places: 3 },      // 3-seater
  armchair:     { w: 85,  h: 85,  label: 'Armchair',     seat: true, places: 1 },
  tv_unit:      { w: 140, h: 40,  label: 'TV unit',      screen: true, outlet: true }, // 55" screen on top
  coffee_table: { w: 110, h: 60,  label: 'Coffee table' },
  dining_table: { w: 180, h: 90,  label: 'Dining table', places: 6, use: true }, // seats 6
  chair:        { w: 45,  h: 50,  label: 'Chair',        places: 1 },
  desk:         { w: 140, h: 70,  label: 'Desk',         screen: true, outlet: true, places: 1, use: true },
  bed_double:   { w: 160, h: 200, label: 'Double bed',   bed: true, places: 2 },
  bed_single:   { w: 90,  h: 200, label: 'Single bed',   bed: true, places: 1 },
  wardrobe:     { w: 120, h: 58,  label: 'Wardrobe',     tall: true, use: true },
  bookshelf:    { w: 80,  h: 28,  label: 'Bookshelf',    tall: true, use: true },
  plant:        { w: 40,  h: 40,  label: 'Plant' },
  lamp:         { w: 30,  h: 30,  label: 'Floor lamp',   outlet: true },
  rug:          { w: 230, h: 160, label: 'Rug',          passable: true },
  counter:      { w: 180, h: 60,  label: 'Worktop',      tall: true, use: true },
  toilet:       { w: 40,  h: 70,  label: 'Toilet',       wet: true, use: true },
  basin:        { w: 55,  h: 45,  label: 'Basin',        wet: true, use: true },
  shower:       { w: 90,  h: 90,  label: 'Shower',       wet: true, use: true },
  bathtub:      { w: 170, h: 75,  label: 'Bath',         wet: true, use: true },
  sink:         { w: 60,  h: 60,  label: 'Sink',         tall: true, wet: true, use: true },
  hob:          { w: 60,  h: 60,  label: 'Hob',          tall: true, outlet: true, hot: true, use: true },
  fridge:       { w: 60,  h: 65,  label: 'Fridge',       tall: true, outlet: true, cold: true, use: true },
  blind:        { w: 160, h: 8,   label: 'Blind',        passable: true, wall: true }, // over a window: kills glare, keeps the view
  ceiling_light:{ w: 50,  h: 50,  label: 'Ceiling light', passable: true, ceiling: true },
  pendant:      { w: 40,  h: 40,  label: 'Pendant lamp',  passable: true, ceiling: true },
  spotlight_bar:{ w: 90,  h: 12,  label: 'Spot bar',      passable: true, ceiling: true },
  chandelier:   { w: 80,  h: 80,  label: 'Chandelier',    passable: true, ceiling: true },
  downlights:   { w: 240, h: 240, label: 'Downlights',    passable: true, ceiling: true },
  cove_strip:   { w: 200, h: 10,  label: 'Cove strip',    passable: true, ceiling: true, wall: true },
  wall_sconce:  { w: 20,  h: 12,  label: 'Wall sconce',   passable: true, ceiling: true, wall: true },
  track_light:  { w: 140, h: 10,  label: 'Track light',   passable: true, ceiling: true },
} as const satisfies Record<string, { w: number; h: number; label: string; seat?: true; screen?: true; outlet?: true; bed?: true; tall?: true; passable?: true; ceiling?: true; wall?: true; places?: number; wet?: true; hot?: true; cold?: true; use?: true }>

export const CATALOG_TYPES = Object.keys(CATALOG) as ItemType[]
export const spec = (t: ItemType) => CATALOG[t] as (typeof CATALOG)[ItemType] & { seat?: true; screen?: true; outlet?: true; bed?: true; tall?: true; passable?: true; ceiling?: true; wall?: true; places?: number; wet?: true; hot?: true; cold?: true; use?: true }
