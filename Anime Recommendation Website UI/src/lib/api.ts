// ==============================================================================
// SRC/LIB/API.TS - SINKRONISASI BACKEND V4 (MODEL4.JOBLIB)
// ==============================================================================

export const BASE_URL = 'https://api.jikan.moe/v4';
const FASTAPI_URL = "https://jikojeromi77-anime-be.hf.space"; 

export interface Anime {
  mal_id: number;
  title: string;
  images: {
    jpg: {
      image_url: string;
      large_image_url: string;
    };
  };
  synopsis: string;
  score: number;
  genres: { name: string }[];
  themes: { name: string }[];
  recommendation_source?: string;
  final_score?: number;
}

/**
 * Sanitasi Metadata: Mengubah string dari backend menjadi array objek UI
 */
function safeParseTags(tagRaw: any): { name: string }[] {
  if (!tagRaw) return [];
  if (Array.isArray(tagRaw)) {
    return tagRaw.map((t: any) => ({ name: typeof t === 'string' ? t : (t.name || '') }));
  }
  try {
    if (typeof tagRaw === 'string') {
      const cleaned = tagRaw.replace(/[\[\]'"]/g, '').split(',');
      return cleaned.map(t => t.trim()).filter(t => t.length > 0).map(t => ({ name: t }));
    }
  } catch (e) {
    console.error("Tag parsing error:", e);
  }
  return [];
}

/**
 * Mapper Utama: Transformasi response backend ke format Frontend
 */
function mapBackendToFrontendModel(recommendations: any[]): Anime[] {
  if (!Array.isArray(recommendations)) return [];
  
  return recommendations.map((item) => {
    const directImageUrl = item.image_url || "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=400";

    return {
      mal_id: item.mal_id ? Number(item.mal_id) : Math.floor(Math.random() * 100000),
      title: item.title || "Untitled Anime",
      score: item.score || 0,
      synopsis: item.synopsis || "No description available.",
      images: {
        jpg: {
          image_url: directImageUrl,
          large_image_url: directImageUrl
        }
      },
      genres: safeParseTags(item.genres),
      themes: safeParseTags(item.themes),
      recommendation_source: "Hybrid Model v4",
      final_score: item.final_score
    } as Anime;
  });
}

// ==============================================================================
// FETCH FUNCTIONS
// ==============================================================================

/**
 * Skenario 1: Hybrid Recommendation By Title
 */
export async function fetchRecommendationsByTitle(title: string): Promise<Anime[]> {
  try {
    // alpha diset 0.5 sesuai setting model4
    const url = `${FASTAPI_URL}/recommend?title=${encodeURIComponent(title)}&alpha=0.5&top_n=20&_cb=${new Date().getTime()}`;

    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error("Backend Error");

    const result = await response.json();
    return mapBackendToFrontendModel(result.data || []);
  } catch (error) {
    console.error("Error fetching recommendations by title:", error);
    return [];
  }
}

/**
 * Skenario 2: Filter Katalog Genre & Themes
 */
export async function fetchRecommendationsByGenreTheme(genres: string[], themes: string[]): Promise<Anime[]> {
  try {
    const combinedTags = [...genres, ...themes];
    if (combinedTags.length === 0) return [];

    const queryParams = combinedTags.map(tag => `tags=${encodeURIComponent(tag)}`).join('&');
    const url = `${FASTAPI_URL}/catalog?${queryParams}&top_n=20&_cb=${new Date().getTime()}`;

    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error("Backend Catalog Error");

    const result = await response.json();
    return mapBackendToFrontendModel(result.data || []);
  } catch (error) {
    console.error("Error fetching catalog filter:", error);
    return [];
  }
}

// Jikan Fallback Functions
export async function fetchTopAnime(): Promise<Anime[]> {
  try {
    const res = await fetch(`${BASE_URL}/top/anime?limit=15`);
    const data = await res.json();
    return data.data;
  } catch {
    return [];
  }
}

export async function searchAnime(query: string): Promise<Anime[]> {
  try {
    const res = await fetch(`${BASE_URL}/anime?q=${query}&limit=12`);
    const data = await res.json();
    return data.data;
  } catch {
    return [];
  }
}
