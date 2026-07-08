// ==============================================================================
// SRC/LIB/API.TS - SINKRONISASI BACKEND BARU (itsmeh-anime-be3)
// ==============================================================================

export const BASE_URL = 'https://api.jikan.moe/v4';
const FASTAPI_URL = "https://itsmeh-anime-be3.hf.space"; 

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
      // Menangani format string python list jika ada
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
    // Sesuaikan field jika backend mengirim field yang berbeda
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
      recommendation_source: "Hybrid Model",
      final_score: item.hybrid_score || item.score
    } as Anime;
  });
}

// ==============================================================================
// FETCH FUNCTIONS
// ==============================================================================

/**
 * Skenario 1: Hybrid Recommendation By Title
 */
export async function fetchRecommendationsByTitle(title: string, top_n: number = 20): Promise<Anime[]> {
  try {
    const url = `${FASTAPI_URL}/recommend?title=${encodeURIComponent(title)}&top_n=${top_n}`;

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
 * Skenario 2: Filter Katalog Genre & Themes (Menggunakan endpoint /search)
 */
export async function fetchRecommendationsByGenreTheme(genres: string[], themes: string[], top_n: number = 20): Promise<Anime[]> {
  try {
    if (genres.length === 0 && themes.length === 0) return [];

    const params = new URLSearchParams();
    genres.forEach(g => params.append('genre', g));
    themes.forEach(t => params.append('themes', t));
    params.append('top_n', top_n.toString());

    const url = `${FASTAPI_URL}/search?${params.toString()}`;

    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error("Backend Catalog Error");

    const result = await response.json();
    return mapBackendToFrontendModel(result.data || []);
  } catch (error) {
    console.error("Error fetching catalog filter:", error);
    return [];
  }
}

/**
 * Skenario 3: Fetch Katalog Umum (Top N)
 */
export async function fetchCatalog(top_n: number = 20): Promise<Anime[]> {
  try {
    const response = await fetch(`${FASTAPI_URL}/catalog?top_n=${top_n}`);
    const result = await response.json();
    return mapBackendToFrontendModel(result.data || []);
  } catch (error) {
    console.error("Error fetching catalog:", error);
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

