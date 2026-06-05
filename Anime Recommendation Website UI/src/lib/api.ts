// ==============================================================================
// FULL CODE REVISI: SRC/LIB/API.TS (SINKRONISASI JIKAN API & REKOMENDASI FASTAPI)
// ==============================================================================

export const BASE_URL = 'https://api.jikan.moe/v4';
const FASTAPI_URL = 'http://127.0.0.1:8000/api';

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
 * SKENARIO 1: Ambil Rekomendasi berdasarkan Judul + Otomatis Cari Gambar ke Jikan API
 */
export async function fetchRecommendationsByTitle(title: string): Promise<Anime[]> {
  try {
    const response = await fetch(`${FASTAPI_URL}/recommend/by-title?title=${encodeURIComponent(title)}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) throw new Error("Gagal mengambil data dari server rekomendasi lokal.");

    const resultData = await response.json();
    const recommendationsFromModel = resultData.recommendations || [];

    const finalEnrichedAnimeList: Anime[] = [];

    // Loop data dari Python satu per satu untuk ditempelkan data gambar dari Jikan
    for (const item of recommendationsFromModel) {
      try {
        const jikanRes = await fetch(`${BASE_URL}/anime?q=${encodeURIComponent(item.title)}&limit=1`);
        if (jikanRes.ok) {
          const jikanData = await jikanRes.json();
          if (jikanData.data && jikanData.data.length > 0) {
            const matchedAnime = jikanData.data[0];
            
            finalEnrichedAnimeList.push({
              mal_id: item.mal_id || matchedAnime.mal_id,
              title: item.title,
              score: item.score || matchedAnime.score,
              synopsis: matchedAnime.synopsis || "No synopsis available.",
              images: matchedAnime.images, // Menggunakan gambar asli dari Jikan API
              genres: item.genres ? item.genres.map((g: string) => ({ name: g })) : matchedAnime.genres,
              themes: item.themes ? item.themes.map((t: string) => ({ name: t })) : matchedAnime.themes,
              recommendation_source: item.recommendation_source,
              final_score: item.final_score,
              content_score: item.content_score,
              collaborative_score: item.collaborative_score
            });
          } else {
            throw new Error("Data Jikan tidak ditemukan");
          }
        } else {
          throw new Error("Fetch Jikan gagal");
        }
      } catch (e) {
        // Fallback jika koneksi internet terputus atau terkena limit
        finalEnrichedAnimeList.push({
          mal_id: item.mal_id || Math.floor(Math.random() * 100000),
          title: item.title,
          score: item.score || 0,
          synopsis: `Recommended via: ${item.recommendation_source || 'hybrid model'}.`,
          images: {
            jpg: {
              image_url: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=400",
              large_image_url: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600"
            }
          },
          genres: item.genres ? item.genres.map((g: string) => ({ name: g })) : [],
          themes: item.themes ? item.themes.map((t: string) => ({ name: t })) : [],
          recommendation_source: item.recommendation_source
        });
      }
      // Memberikan jeda waktu 300ms agar Jikan API tidak memblokir request
      await delay(300);
    }

    return finalEnrichedAnimeList;

  } catch (error) {
    console.error("Error pada Skenario 1 (By Title):", error);
    return getMockAnimeList().slice(0, 15);
  }
}

/**
 * SKENARIO 2: Ambil Rekomendasi berdasarkan Genre/Tema + Otomatis Cari Gambar ke Jikan API
 */
export async function fetchRecommendationsByGenreTheme(genres: string[], themes: string[]): Promise<Anime[]> {
  try {
    const response = await fetch(`${FASTAPI_URL}/recommend/by-genre-theme`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ genres, themes })
    });

    if (!response.ok) throw new Error("Gagal mengambil data filter dari server rekomendasi lokal.");

    const resultData = await response.json();
    const recommendationsFromModel = resultData.recommendations || [];

    const finalEnrichedAnimeList: Anime[] = [];

    for (const item of recommendationsFromModel) {
      try {
        const jikanRes = await fetch(`${BASE_URL}/anime?q=${encodeURIComponent(item.title)}&limit=1`);
        if (jikanRes.ok) {
          const jikanData = await jikanRes.json();
          if (jikanData.data && jikanData.data.length > 0) {
            const matchedAnime = jikanData.data[0];
            
            finalEnrichedAnimeList.push({
              mal_id: item.mal_id || matchedAnime.mal_id,
              title: item.title,
              score: item.score || matchedAnime.score,
              synopsis: matchedAnime.synopsis || "No synopsis available.",
              images: matchedAnime.images,
              genres: item.genres ? item.genres.map((g: string) => ({ name: g })) : matchedAnime.genres,
              themes: item.themes ? item.themes.map((t: string) => ({ name: t })) : matchedAnime.themes,
              match_percentage: item.match_percentage,
              genre_overlap: item.genre_overlap,
              theme_overlap: item.theme_overlap,
              final_score: item.final_score
            });
          } else {
            throw new Error("Data Jikan tidak ditemukan");
          }
        } else {
          throw new Error("Fetch Jikan gagal");
        }
      } catch (e) {
        finalEnrichedAnimeList.push({
          mal_id: item.mal_id || Math.floor(Math.random() * 100000),
          title: item.title,
          score: item.score || 0,
          synopsis: `Metadata Match: ${(item.match_percentage * 100).toFixed(1)}%.`,
          images: {
            jpg: {
              image_url: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=400",
              large_image_url: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600"
            }
          },
          genres: item.genres ? item.genres.map((g: string) => ({ name: g })) : [],
          themes: item.themes ? item.themes.map((t: string) => ({ name: t })) : []
        });
      }
      await delay(300);
    }

    return finalEnrichedAnimeList;

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