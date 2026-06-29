// ==============================================================================
// FULL CODE REVISI FINAL: SRC/LIB/API.TS (SISTEM 3 - PURE HYBRID SINKRON)
// ==============================================================================

export const BASE_URL = 'https://api.jikan.moe/v4';

// Ganti URL ini dengan URL Hugging Face Spaces Sistem 3 asli milikmu
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
  content_score?: number;
  collaborative_score?: number;
}

/**
 * HELPER SANITASI: Mengubah raw metadata genres/themes dari backend menjadi format array objek UI.
 */
function safeParseTags(tagRaw: any): { name: string }[] {
  if (!tagRaw) return [];
  if (Array.isArray(tagRaw)) {
    return tagRaw.map((t: any) => ({ name: typeof t === 'string' ? t : (t.name || '') }));
  }
  try {
    if (typeof tagRaw === 'string') {
      const cleaned = tagRaw.replace(/[\[\]']/g, '').split(',');
      return cleaned
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .map(t => ({ name: t }));
    }
  } catch (e) {
    console.error("Gagal melakukan parsing tag:", e);
  }
  return [];
}

/**
 * MAPPER UTAMA: Mengubah list record keluaran main.py menjadi format komponen React secara presisi
 */
function mapBackendToFrontendModel(recommendations: any[]): Anime[] {
  if (!Array.isArray(recommendations)) return [];
  
  return recommendations.map((item) => {
    const parsedGenres = safeParseTags(item.genres);
    const parsedThemes = safeParseTags(item.themes);
    const directImageUrl = item.image_url || "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=400";

    return {
      mal_id: item.mal_id,
      title: item.title,
      score: item.score || 0,
      synopsis: item.synopsis || `Recommended via Pure Hybrid Filtering (System 3).`,
      images: {
        jpg: {
          image_url: directImageUrl,
          large_image_url: directImageUrl
        }
      },
      genres: parsedGenres,
      themes: parsedThemes,
      recommendation_source: "Pure Hybrid",
      final_score: item.final_score,
      content_score: item.content_score,
      collaborative_score: item.collaborative_score
    } as Anime;
  });
}

// ==============================================================================
// METHOD COMPATIBILITY STUB (DIRETAIN AGAR COMPONENT LAIN TIDAK ERROR SAAT COMPILE)
// ==============================================================================
export async function enrichAnimeDataBatch(recommendations: any[]): Promise<Anime[]> {
  return mapBackendToFrontendModel(recommendations);
}
export async function fetchJikanDetail(item: any): Promise<any> {
  return item;
}
export async function fetchRecommendationsByGenreTheme(genres: string[], themes: string[]): Promise<Anime[]> {
  return [];
}
// ==============================================================================

export async function fetchTopAnime(): Promise<Anime[]> {
  try {
    const res = await fetch(`${BASE_URL}/top/anime?limit=15`);
    if (!res.ok) throw new Error('Failed to fetch top anime');
    const data = await res.json();
    return data.data;
  } catch (error) {
    console.error('API Error:', error);
    return getMockAnimeList();
  }
}

export async function searchAnime(query: string): Promise<Anime[]> {
  try {
    const res = await fetch(`${BASE_URL}/anime?q=${query}&limit=12`);
    if (!res.ok) throw new Error('Failed to fetch search result');
    const data = await res.json();
    return data.data;
  } catch (error) {
    console.error('API Error:', error);
    return [];
  }
}

/**
 * SKENARIO 1 SISTEM 3: Hit langsung ke endpoint /recommend (Mendukung TOP 20 instan)
 */
export async function fetchRecommendationsByTitle(title: string): Promise<Anime[]> {
  try {
    const timestamp = new Date().getTime();
    const url = `${FASTAPI_URL}/recommend?title=${encodeURIComponent(title)}&alpha=0.7&top_n=20&_cb=${timestamp}`;

    const response = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) throw new Error("Gagal mengambil data dari server rekomendasi Sistem 3.");

    const resultData = await response.json();
    const recommendationsFromModel = resultData && resultData.data ? resultData.data : [];

    return mapBackendToFrontendModel(recommendationsFromModel);

  } catch (error) {
    console.error("API Error:", error);
    return getMockAnimeList();
  }
}

function getMockAnimeList(): Anime[] {
  return [
    {
      mal_id: 1,
      title: "Cyberpunk: Edgerunners",
      images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/1818/126132l.jpg", large_image_url: "https://cdn.myanimelist.net/images/anime/1818/126132l.jpg" } },
      synopsis: "In a dystopia riddled with corruption, a street kid strives to become an edgerunner.",
      score: 8.6,
      genres: [{ name: "Action" }, { name: "Sci-Fi" }],
      themes: [{ name: "Cyberpunk" }]
    }
  ];
}
