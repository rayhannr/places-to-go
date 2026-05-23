export interface PlaceRow {
  Name: string
  City: string
  Link: string
  'Distance (km)': string | number | null
  'Travel Time (min)': string | number | null
  'Date Visited': string | null
  'Distance (from current location)': string | number | null
  'Travel Time (from current location)': string | number | null
  // Support for lowercase keys if they exist in legacy code
  name?: string
  city?: string
  link?: string
  distKm?: string | number
  travelMin?: string | number
  lat?: number
  lng?: number
}

export type ToolPart = {
  type: string
  state: string
  output?: { 
    length?: number; 
    entry?: { name?: string }; 
    address?: string; 
    success?: boolean; 
    updated?: boolean; 
    count?: number;
    placeName?: string;
    visitDate?: string;
    message?: string;
  } | null
}

export type MessagePart = { type: 'text'; text: string } | ToolPart

export type Message = {
  id: string
  role: 'user' | 'assistant'
  parts?: MessagePart[]
  content?: string
}
