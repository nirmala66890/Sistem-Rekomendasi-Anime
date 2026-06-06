// ==============================================================================
// FULL CODE REVISI: SRC/LIB/API.TS (SINKRONISASI JIKAN API & REKOMENDASI FASTAPI)
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
  match_percentage?: number;
  genre_overlap?: number;
  theme_overlap?: number;
  final_score?: number;
  content_score?: number;
  collaborative_score?: number;
}

// Helper fungsi delay untuk mencegah Jikan API Rate Limit 429
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * HELPER: Mengambil detail satu anime secara cerdas dari Jikan.
 * Mengutamakan mal_id jika ada, atau menggunakan query title sebagai fallback.
 */
async function fetchJikanDetail(item: any): Promise<any> {
  if (item.mal_id) {
    const res = await fetch(`${BASE_URL}/anime/${item.mal_id}`);
    if (!res.ok) throw new Error(`Failed fetch Jikan ID ${item.mal_id}`);
    const json = await res.json();
    return json.data;
  } 
  
  const res = await fetch(`${BASE_URL}/anime?q=${encodeURIComponent(item.title)}&limit=1`);
  if (!res.ok) throw new Error(`Failed fetch Jikan Title ${item.title}`);
  const json = await res.json();
  if (json.data && json.data.length > 0) return json.data[0];
  
  throw new Error("Anime tidak ditemukan di Jikan");
}

/**
 * HELPER: Memproses pengayaan data gambar dari Jikan menggunakan sistem Batch (Paralel)
 * Jauh lebih cepat daripada loop satu per satu (sekuensial).
 */
async function enrichAnimeDataBatch(recommendations: any[]): Promise<Anime[]> {
  const finalEnrichedAnimeList: Anime[] = [];
  const BATCH_SIZE = 3; // Mengambil 3 gambar anime sekaligus per gelombang

  for (let i = 0; i < recommendations.length; i += BATCH_SIZE) {
    const batch = recommendations.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (item) => {
      try {
        const matchedAnime = await fetchJikanDetail(item);
        
        return {
          mal_id: item.mal_id || matchedAnime.mal_id,
          title: item.title,
          score: item.score || matchedAnime.score,
          synopsis: matchedAnime.synopsis || "No synopsis available.",
          images: matchedAnime.images,
          genres: item.genres ? item.genres.map((g: string) => ({ name: g })) : matchedAnime.genres,
          themes: item.themes ? item.themes.map((t: string) => ({ name: t })) : matchedAnime.themes,
          recommendation_source: item.recommendation_source,
          match_percentage: item.match_percentage,
          genre_overlap: item.genre_overlap,
          theme_overlap: item.theme_overlap,
          final_score: item.final_score,
          content_score: item.content_score,
          collaborative_score: item.collaborative_score
        } as Anime;
      } catch (e) {
        console.warn(`Fallback digunakan untuk anime: ${item.title}`, e);
        return {
          mal_id: item.mal_id || Math.floor(Math.random() * 100000),
          title: item.title,
          score: item.score || 0,
          synopsis: item.recommendation_source 
            ? `Recommended via: ${item.recommendation_source}.`
            : `Metadata Match: ${((item.match_percentage || 0) * 100).toFixed(1)}%.`,
          images: {
            jpg: {
              image_url: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=400",
              large_image_url: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600"
            }
          },
          genres: item.genres ? item.genres.map((g: string) => ({ name: g })) : [],
          themes: item.themes ? item.themes.map((t: string) => ({ name: t })) : [],
          recommendation_source: item.recommendation_source
        } as Anime;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    finalEnrichedAnimeList.push(...batchResults);

    if (i + BATCH_SIZE < recommendations.length) {
      await delay(1000); // Jeda 1 detik antar-batch aman dari limit 429
    }
  }

  return finalEnrichedAnimeList;
}

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
 * SKENARIO 1: Ambil Rekomendasi berdasarkan Judul (FIXED URL dengan /api)
 */
export async function fetchRecommendationsByTitle(title: string): Promise<Anime[]> {
  try {
    const response = await fetch(`${FASTAPI_URL}/api/recommend/by-title?title=${encodeURIComponent(title)}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) throw new Error("Gagal mengambil data dari server rekomendasi.");

    const resultData = await response.json();
    const recommendationsFromModel = resultData.recommendations || [];

    return await enrichAnimeDataBatch(recommendationsFromModel);

  } catch (error) {
    console.error("Error pada Skenario 1 (By Title):", error);
    return getMockAnimeList().slice(0, 15);
  }
}

/**
 * SKENARIO 2: Ambil Rekomendasi berdasarkan Genre/Tema (FIXED URL dengan /api)
 */
export async function fetchRecommendationsByGenreTheme(genres: string[], themes: string[]): Promise<Anime[]> {
  try {
    const response = await fetch(`${FASTAPI_URL}/api/recommend/by-genre-theme`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ genres, themes })
    });

    if (!response.ok) throw new Error("Gagal mengambil data filter dari server rekomendasi.");

    const resultData = await response.json();
    const recommendationsFromModel = resultData.recommendations || [];

    return await enrichAnimeDataBatch(recommendationsFromModel);

  } catch (error) {
    console.error("Error pada Skenario 2 (By Genre/Theme):", error);
    return getMockAnimeList().slice(0, 15);
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