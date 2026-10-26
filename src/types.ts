export interface MediaItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string;
  backdrop_path?: string;
  overview: string;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
  genre_ids?: number[];
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  genres?: { id: number; name: string }[];
  imdb_id?: string;
}

export interface Episode {
  id: number;
  episode_number: number;
  name?: string;
  overview?: string;
  still_path?: string;
}

export interface Season {
  id: number;
  season_number: number;
  name?: string;
  episode_count?: number;
  poster_path?: string;
}

export interface TvDetails {
  seasons?: Season[];
  number_of_seasons?: number;
}

export interface Subtitle {
  id: string;
  tmdb_id: number;
  media_type: string;
  season_number: number | null;
  episode_number: number | null;
  title: string;
  language: string;
  content: string;
  created_at: string;
  updated_at: string;
  file_url?: string | null;
  label?: string | null;
  is_auto?: boolean;
}
