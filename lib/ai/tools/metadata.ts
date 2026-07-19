export type ToolCategory = 'discovery' | 'actions' | 'location' | 'search'

export interface ToolMetadata {
  label: string
  blurb: string
  statusText: string
  mutating: boolean
  category: ToolCategory
}

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  discovery: 'Find Shit',
  actions: 'Do Shit',
  location: 'Where You At',
  search: 'Outside The List'
}

export const CATEGORY_ORDER: ToolCategory[] = ['discovery', 'actions', 'location', 'search']

export const TOOL_METADATA: Record<string, ToolMetadata> = {
  get_random_places: {
    label: 'Surprise Me',
    blurb: 'Throws a random spot at you from your list, visited or not, your call.',
    statusText: 'Rolling the dice…',
    mutating: false,
    category: 'discovery'
  },
  get_nearby_places: {
    label: 'Nearby Places',
    blurb: 'Digs up whatever\'s closest to your base or wherever you\'re standing.',
    statusText: 'Scoping what\'s close…',
    mutating: false,
    category: 'discovery'
  },
  get_quickest_places: {
    label: 'Quickest Places',
    blurb: 'Finds the spots you can reach fastest so you stop wasting travel time.',
    statusText: 'Checking travel times…',
    mutating: false,
    category: 'discovery'
  },
  get_places_by_city: {
    label: 'By City',
    blurb: 'Filters your list down to one city so you stop scrolling like an idiot.',
    statusText: 'Digging through the city…',
    mutating: false,
    category: 'discovery'
  },
  get_places_by_category: {
    label: 'By Category',
    blurb: 'Filters your list down to one or more categories, like cuisine or food type.',
    statusText: 'Digging through categories…',
    mutating: false,
    category: 'discovery'
  },
  get_categories: {
    label: 'All Categories',
    blurb: 'Lists every category on your list and how many places are tagged with each.',
    statusText: 'Counting categories…',
    mutating: false,
    category: 'discovery'
  },
  search_places_by_name: {
    label: 'Search By Name',
    blurb: 'Hunts your list for a place by name, typos and all.',
    statusText: 'Searching your list…',
    mutating: false,
    category: 'discovery'
  },
  get_priority_places: {
    label: 'Priority Queue',
    blurb: 'Pulls up your "go next" queue, ranked so you know where to head first.',
    statusText: 'Checking the queue…',
    mutating: false,
    category: 'discovery'
  },
  add_place: {
    label: 'Add Place',
    blurb: 'Drops a new spot on your list from a Maps link. Name, city, distance, all auto-filled.',
    statusText: 'Adding to the list…',
    mutating: true,
    category: 'actions'
  },
  visit_place: {
    label: 'Mark Visited',
    blurb: 'Marks a place as hit on a given date, or un-hits it if you screwed up.',
    statusText: 'Marking it down…',
    mutating: true,
    category: 'actions'
  },
  delete_place: {
    label: 'Delete Place',
    blurb: 'Wipes a place off your list. Gone. No take-backs.',
    statusText: 'Deleting…',
    mutating: true,
    category: 'actions'
  },
  prioritize_place: {
    label: 'Prioritize',
    blurb: 'Bumps a place up or down your "go next" queue, or yanks it off entirely.',
    statusText: 'Reshuffling the queue…',
    mutating: true,
    category: 'actions'
  },
  update_place: {
    label: 'Update Place',
    blurb: 'Edits a place\'s name, city, link, or category (one or more categories, comma-separated).',
    statusText: 'Updating the place…',
    mutating: true,
    category: 'actions'
  },
  get_current_location: {
    label: 'Where Am I',
    blurb: 'Turns your GPS coordinates into an actual address, since you clearly don\'t know.',
    statusText: 'Figuring out where you\'re at…',
    mutating: false,
    category: 'location'
  },
  sync_all_distances: {
    label: 'Sync Distances',
    blurb: 'Recalculates distance and travel time to everything on your list from where you\'re standing now.',
    statusText: 'Crunching the distances…',
    mutating: false,
    category: 'location'
  },
  parse_place_link: {
    label: 'Parse Link',
    blurb: 'Cracks open a Maps link or coordinates to grab the place name and location.',
    statusText: 'Cracking the link…',
    mutating: false,
    category: 'location'
  },
  search_google_maps: {
    label: 'Google Maps Search',
    blurb: 'Goes outside your list and searches Google Maps directly.',
    statusText: 'Hitting up Google Maps…',
    mutating: false,
    category: 'search'
  }
}
