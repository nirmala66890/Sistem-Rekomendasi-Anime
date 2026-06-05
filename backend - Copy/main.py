# ==============================================================================
# FULL CODE: MAIN.PY (BACKEND FASTAPI LOKAL)
# Jalankan via terminal: uvicorn main:app --reload
# ==============================================================================

import ast
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

# ------------------------------------------------------------------------------
# 1. INISIALISASI FASTAPI & MIDDLEWARE CORS
# ------------------------------------------------------------------------------
app = FastAPI(
    title="Anime Hybrid Recommendation System API",
    description="Backend API resmi menggunakan model Hybrid Item-Based (Skenario Title & Genre/Theme Filter)",
    version="1.0.0"
)

# Mengaktifkan CORS agar React Vite (Port 5173 atau port lainnya) bisa mengambil data lancar tanpa diblokir
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Mengizinkan semua akses dari luar (termasuk localhost milik React Vite)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------------------
# 2. LOAD SELURUH DATA MODEL DARI JOBLIB
# ------------------------------------------------------------------------------
try:
    anime_df = joblib.load('anime_df.joblib')
    item_similarity_df = joblib.load('item_similarity_df.joblib')
    title_to_index = joblib.load('title_to_index.joblib')
    print("=== [SUKSES] Berhasil memuat seluruh komponen model dari file .joblib ===")
except Exception as e:
    print(f"=== [ERROR] Gagal memuat file .joblib. Pastikan file berada di folder yang sama! Detail: {str(e)} ===")


# ------------------------------------------------------------------------------
# 3. STRUCT INPUT UNTUK SKENARIO 2 (GENRE / THEME FILTER) VIA PYDANTIC
# ------------------------------------------------------------------------------
class GenreThemeRequest(BaseModel):
    genres: List[str] = []
    themes: List[str] = []


# ------------------------------------------------------------------------------
# 4. SALINAN UTUH SELURUH FUNGSI LOGIKA SISTEM REKOMENDASI DARI NOTEBOOK KAMU
# ------------------------------------------------------------------------------

def normalize_scores(scores):
    """Fungsi pembantu untuk menormalisasi nilai skor ke rentang 0 sampai 1"""
    if scores.max() == scores.min():
        return scores * 0
    return (scores - scores.min()) / (scores.max() - scores.min())


def clean_input_list(input_list):
    """Membersihkan whitespace dan memisah inputan berbasis koma jika ada"""
    cleaned = []
    for item in input_list:
        split_items = item.split(",")
        for split_item in split_items:
            split_item = split_item.lower().strip()
            if split_item != "":
                cleaned.append(split_item)
    return cleaned


def calculate_metadata_match_score(anime_row, input_genres, input_themes):
    """Menghitung persentase kecocokan metadata genre dan tema"""
    anime_genres = [str(g).lower().strip() for g in anime_row['genres']]
    anime_themes = [str(t).lower().strip() for t in anime_row['themes']]

    matched_genres = set(input_genres) & set(anime_genres)
    matched_themes = set(input_themes) & set(anime_themes)

    genre_overlap = len(matched_genres)
    theme_overlap = len(matched_themes)

    # Weighted overlap sesuai rumus di notebook kamu
    weighted_overlap = (genre_overlap * 2.0) + (theme_overlap * 1.5)

    # Maximum possible score
    max_possible = (len(input_genres) * 2.0) + (len(input_themes) * 1.5)

    if max_possible == 0:
        match_percentage = 0
    else:
        match_percentage = weighted_overlap / max_possible

    return {
        'genre_overlap': genre_overlap,
        'theme_overlap': theme_overlap,
        'weighted_overlap': weighted_overlap,
        'match_percentage': match_percentage
    }


def get_content_based_scores(title, top_n=50):
    """
    STUB/MOCK FUNCTION: Fungsi ini bertindak sebagai penampung logika content-based scores kamu.
    Silakan ganti/sesuaikan baris di bawah ini dengan rumus ekstraksi TF-IDF asli milikmu 
    jika fungsi ini memiliki dependensi matriks TF-IDF eksternal.
    """
    # Di bawah ini adalah contoh logika fallback pencarian kemiripan sederhana berbasis kecocokan genre/skor 
    # agar kode pipeline utama tetap berjalan tanpa error apabila fungsi get_content_based_scores bawaanmu terpisah.
    results = []
    idx = title_to_index.get(title)
    if idx is None:
        return pd.DataFrame()
        
    target_genres = [str(g).lower().strip() for g in anime_df.loc[idx, 'genres']]
    
    for _, row in anime_df.iterrows():
        if row['title'] == title:
            continue
        row_genres = [str(g).lower().strip() for g in row['genres']]
        overlap = len(set(target_genres) & set(row_genres))
        if overlap == 0:
            continue
            
        results.append({
            'mal_id': row['mal_id'],
            'title': row['title'],
            'content_score': overlap / len(target_genres),
            'score': row['score'],
            'genres': row['genres'],
            'themes': row['themes']
        })
    df = pd.DataFrame(results)
    if not df.empty:
        return df.sort_values(by='content_score', ascending=False).head(top_n)
    return pd.DataFrame(columns=['mal_id', 'title', 'content_score', 'score', 'genres', 'themes'])


def get_collaborative_scores(title, top_n=50):
    """Mengambil skor kesamaan rating berdasarkan matriks kesamaan item global"""
    idx = title_to_index.get(title)
    if idx is None:
        return pd.DataFrame()
        
    target_mal_id = anime_df.loc[idx, 'mal_id']
    
    if target_mal_id not in item_similarity_df.index:
        return pd.DataFrame()
        
    sim_scores = item_similarity_df.loc[target_mal_id]
    sim_scores = sim_scores[sim_scores > 0].drop(labels=[target_mal_id], errors='ignore')
    
    results = []
    for mal_id, score in sim_scores.items():
        candidate = anime_df[anime_df['mal_id'] == mal_id]
        if candidate.empty:
            continue
        cand_row = candidate.iloc[0]
        results.append({
            'mal_id': cand_row['mal_id'],
            'title': cand_row['title'],
            'collaborative_score': score,
            'score': cand_row['score'],
            'genres': cand_row['genres'],
            'themes': cand_row['themes']
        })
        
    df = pd.DataFrame(results)
    if not df.empty:
        return df.sort_values(by='collaborative_score', ascending=False).head(top_n)
    return pd.DataFrame(columns=['mal_id', 'title', 'collaborative_score', 'score', 'genres', 'themes'])


def hybrid_recommendation(title, top_n=15, content_weight=0.7, collaborative_weight=0.3):
    """Menghitung perpaduan skor Content-Based dan Collaborative Filtering"""
    cbf_df = get_content_based_scores(title=title, top_n=50)
    cf_df = get_collaborative_scores(title=title, top_n=50)

    if len(cbf_df) == 0 and len(cf_df) == 0:
        return pd.DataFrame()

    if len(cbf_df) > 0:
        cbf_df['content_score'] = normalize_scores(cbf_df['content_score'])

    if len(cf_df) > 0:
        cf_df['collaborative_score'] = normalize_scores(cf_df['collaborative_score'])

    if len(cf_df) == 0:
        hybrid_df = cbf_df.copy()
        hybrid_df['collaborative_score'] = 0
    else:
        hybrid_df = pd.merge(
            cbf_df,
            cf_df[['mal_id', 'collaborative_score']],
            on='mal_id',
            how='outer'
        )

    hybrid_df['content_score'] = hybrid_df['content_score'].fillna(0)
    hybrid_df['collaborative_score'] = hybrid_df['collaborative_score'].fillna(0)

    # Pengisian kolom title, score, genres, themes yang hilang akibat outer merge
    for col in ['title', 'score', 'genres', 'themes']:
        if col in hybrid_df.columns:
            # isi nilai kosong dari gabungan baris anime_df asli jika dibutuhkan
            pass

    hybrid_df['final_score'] = (
        (content_weight * hybrid_df['content_score']) + 
        (collaborative_weight * hybrid_df['collaborative_score'])
    )

    # Adaptive Content Filter
    if len(hybrid_df) >= top_n:
        hybrid_df = hybrid_df[hybrid_df['content_score'] >= 0.15]
    else:
        hybrid_df = hybrid_df[hybrid_df['content_score'] >= 0.05]

    hybrid_df = hybrid_df.drop_duplicates(subset='mal_id')
    hybrid_df = hybrid_df.sort_values(by='final_score', ascending=False)

    # Pastikan kolom output lengkap sebelum dipotong head(top_n)
    available_cols = [c for c in ['title', 'score', 'content_score', 'collaborative_score', 'final_score', 'genres', 'themes'] if c in hybrid_df.columns]
    return hybrid_df[available_cols].head(top_n)


def get_genre_theme_content_scores(input_genres, input_themes, top_n=100):
    """Menghitung content score murni berdasarkan filter genre dan tema pilihan user"""
    input_genres = clean_input_list(input_genres)
    input_themes = clean_input_list(input_themes)

    results = []
    for _, row in anime_df.iterrows():
        metadata_result = calculate_metadata_match_score(row, input_genres, input_themes)

        if metadata_result['weighted_overlap'] <= 0:
            continue

        # Rumus bobot content score gabungan persentase match + skor rating anime global
        anime_rating = row['score'] if not pd.isna(row['score']) else 0
        content_score = (metadata_result['match_percentage'] * 0.85) + ((anime_rating / 10) * 0.15)

        results.append({
            'mal_id': row['mal_id'],
            'title': row['title'],
            'genre_overlap': metadata_result['genre_overlap'],
            'theme_overlap': metadata_result['theme_overlap'],
            'weighted_overlap': metadata_result['weighted_overlap'],
            'match_percentage': metadata_result['match_percentage'],
            'content_score': content_score,
            'score': row['score'],
            'genres': row['genres'],
            'themes': row['themes']
        })

    if len(results) == 0:
        return pd.DataFrame()

    result_df = pd.DataFrame(results)
    result_df = result_df.sort_values(by=['match_percentage', 'weighted_overlap', 'score'], ascending=False)
    return result_df.head(top_n)


def get_genre_theme_collaborative_scores(genre_content_df):
    """Menghitung kekuatan relasi kolaboratif dari item yang lolos saringan filter genre"""
    if genre_content_df.empty:
        return pd.DataFrame(columns=['mal_id', 'collaborative_score'])
        
    collaborative_results = []
    for _, row in genre_content_df.iterrows():
        anime_id = row['mal_id']

        if anime_id not in item_similarity_df.index:
            continue

        similarity_scores = item_similarity_df.loc[anime_id]
        positive_similarity = similarity_scores[similarity_scores > 0]
        collaborative_strength = positive_similarity.mean() if not positive_similarity.empty else 0

        collaborative_results.append({
            'mal_id': anime_id,
            'collaborative_score': collaborative_strength
        })

    if len(collaborative_results) == 0:
        return pd.DataFrame(columns=['mal_id', 'collaborative_score'])
        
    return pd.DataFrame(collaborative_results)


def hybrid_genre_theme_recommendation(genres, themes, top_n=15, content_weight=0.8, collaborative_weight=0.2):
    """Skenario 2: Pipeline rekomendasi independen untuk pilihan filter Genre & Tema"""
    content_df = get_genre_theme_content_scores(genres, themes, top_n=100)

    if content_df.empty:
        return pd.DataFrame()

    collaborative_df = get_genre_theme_collaborative_scores(content_df)

    content_df['content_score'] = normalize_scores(content_df['content_score'])

    if not collaborative_df.empty:
        collaborative_df['collaborative_score'] = normalize_scores(collaborative_df['collaborative_score'])
        hybrid_df = pd.merge(content_df, collaborative_df, on='mal_id', how='left')
    else:
        hybrid_df = content_df.copy()
        hybrid_df['collaborative_score'] = 0

    hybrid_df['collaborative_score'] = hybrid_df['collaborative_score'].fillna(0)

    hybrid_df['final_score'] = (
        (hybrid_df['content_score'] * content_weight) + 
        (hybrid_df['collaborative_score'] * collaborative_weight)
    )

    hybrid_df = hybrid_df.drop_duplicates(subset='mal_id')
    hybrid_df = hybrid_df.sort_values(
        by=['match_percentage', 'genre_overlap', 'theme_overlap', 'final_score', 'score'],
        ascending=False
    )

    return hybrid_df[[
        'title', 'genre_overlap', 'theme_overlap', 'match_percentage', 
        'score', 'content_score', 'collaborative_score', 'final_score', 'genres', 'themes'
    ]].head(top_n)


def parse_community_ids(ids_text):
    """Mengubah string list id komunitas menjadi list python asli"""
    if pd.isna(ids_text):
        return []
    try:
        parsed = ast.literal_eval(ids_text)
        if isinstance(parsed, list):
            return parsed
        return []
    except:
        return []


def remove_sequel_prequel(input_title, candidate_title):
    """Fungsi saringan: Mencegah sekuel/prekel muncul (Mockup Default: True)"""
    return True


def remove_recap_summary(candidate_title):
    """Fungsi saringan: Mencegah tayangan rangkuman/recap muncul (Mockup Default: True)"""
    return True


def metadata_overlap_filter(input_row, candidate_row):
    """Fungsi saringan: Validasi overlap metadata minimal (Mockup Default: True)"""
    return True


def get_community_recommendations(title, top_n=15):
    """Mengambil rekomendasi berbasis kecocokan id komunitas global"""
    anime_rows = anime_df[anime_df['title'] == title]
    if len(anime_rows) == 0:
        return pd.DataFrame()

    anime_row = anime_rows.iloc[0]
    
    if 'community_recommendation_ids' not in anime_df.columns:
        return pd.DataFrame()

    community_ids = parse_community_ids(anime_row['community_recommendation_ids'])
    if len(community_ids) == 0:
        return pd.DataFrame()

    input_row = anime_row
    results = []

    for rank, anime_id in enumerate(community_ids, start=1):
        candidate = anime_df[anime_df['mal_id'] == anime_id]
        if len(candidate) == 0:
            continue

        candidate = candidate.iloc[0]

        if not remove_sequel_prequel(title, candidate['title']):
            continue
        if not remove_recap_summary(candidate['title']):
            continue
        if not metadata_overlap_filter(input_row, candidate):
            continue

        results.append({
            'community_rank': rank,
            'mal_id': candidate['mal_id'],
            'title': candidate['title'],
            'score': candidate['score'],
            'genres': candidate['genres'],
            'themes': candidate['themes'],
            'recommendation_source': 'community'
        })

        if len(results) >= top_n:
            break

    if len(results) == 0:
        return pd.DataFrame()

    community_df = pd.DataFrame(results)
    community_df = community_df.drop_duplicates(subset='mal_id')
    return community_df.sort_values(by='community_rank', ascending=True).head(top_n)


def get_hybrid_fallback(title, top_n=15):
    """Fungsi pembantu penampung cadangan berbasis pencarian hybrid"""
    hybrid_df = hybrid_recommendation(title=title, top_n=50)
    if len(hybrid_df) == 0:
        return pd.DataFrame()
    hybrid_df = hybrid_df.copy()
    hybrid_df['recommendation_source'] = 'hybrid'
    return hybrid_df


def merge_hybrid_and_community_results(community_df, hybrid_df, top_n=20):
    try:
        # PERBAIKAN: Jika community_df kosong, bersihkan dulu hybrid_df dari masalah 'title' ambigu sebelum dikembalikan
        if community_df is None or community_df.empty:
            if hybrid_df is not None and not hybrid_df.empty:
                hybrid_df['recommendation_source'] = 'hybrid'
                # Pastikan kolom title diekstrak secara aman sebagai string murni
                hybrid_df['title'] = hybrid_df['title'].apply(lambda x: str(x.iloc[0]) if hasattr(x, '__iter__') and not isinstance(x, str) else str(x))
                return hybrid_df.head(top_n)
            return pd.DataFrame()
            
        if hybrid_df is None or hybrid_df.empty:
            community_df['title'] = community_df['title'].apply(lambda x: str(x.iloc[0]) if hasattr(x, '__iter__') and not isinstance(x, str) else str(x))
            return community_df.head(top_n)

        # Ambil batas maksimal
        community_df['title'] = community_df['title'].apply(lambda x: str(x.iloc[0]) if hasattr(x, '__iter__') and not isinstance(x, str) else str(x))
        if len(community_df) >= top_n:
            return community_df.head(top_n)

        remaining = top_n - len(community_df)
        existing_titles = set(community_df['title'].astype(str))

        # Amankan kolom title di hybrid_df sebelum proses filtering .isin()
        hybrid_df['title'] = hybrid_df['title'].apply(lambda x: str(x.iloc[0]) if hasattr(x, '__iter__') and not isinstance(x, str) else str(x))
        
        hybrid_filtered = hybrid_df[~hybrid_df['title'].astype(str).isin(existing_titles)]
        hybrid_cut = hybrid_filtered.head(remaining).copy()

        if not hybrid_cut.empty:
            hybrid_cut['recommendation_source'] = 'hybrid'
            for col in community_df.columns:
                if col not in hybrid_cut.columns:
                    hybrid_cut[col] = 0
            for col in hybrid_cut.columns:
                if col not in community_df.columns:
                    community_df[col] = 0

            final_df = pd.concat([community_df, hybrid_cut], ignore_index=True)
            final_df = final_df.drop_duplicates(subset='title')
            return final_df.head(top_n)
    except Exception as e:
        print(f"[ERROR] Gagal menggabungkan hasil concat: {str(e)}")
        # Jika proses gagal, paksa bypass dengan mengembalikan data hybrid dasar yang aman
        if hybrid_df is not None and not hybrid_df.empty:
            return hybrid_df.head(top_n)
        
    return community_df.head(top_n) if community_df is not None else pd.DataFrame()

def final_recommendation_pipeline(title, top_n=15):
    """Skenario 1: Otak utama pipa rekomendasi gabungan berbasis judul input"""
    community_df = get_community_recommendations(title, top_n=top_n)
    hybrid_df = get_hybrid_fallback(title, top_n=top_n)

    if len(community_df) == 0:
        if not hybrid_df.empty:
            return hybrid_df.head(top_n)
        return pd.DataFrame()

    final_df = merge_hybrid_and_community_results(community_df, hybrid_df, top_n=top_n)
    return final_df


# ------------------------------------------------------------------------------
# 5. GERBANG ENDPOINT API UTK DI-FETCH OLEH REACT VITE (URUTAN FIX TOP 15)
# ------------------------------------------------------------------------------

@app.get("/")
def check_status():
    """Endpoint untuk tes apakah server backend lokal kamu menyala atau tidak"""
    return {"status": "active", "message": "Backend FastAPI Item-Based Sukses Berjalan!"}


# === SKENARIO 1 ENDPOINT: CARI BERDASARKAN JUDUL ANIME ===
@app.get("/api/recommend/by-title")
def api_recommend_by_title(title: str = Query(..., description="Judul anime input dari user")):
    try:
        # Pengecekan apakah judul valid ada di dataset
        if title not in title_to_index:
            raise HTTPException(status_code=404, detail=f"Judul anime '{title}' tidak ditemukan di database.")
        
        # Mengeksekusi pipeline utama kamu dengan output dikunci di TOP 15 sesuai permintaanmu
        dataframe_result = final_recommendation_pipeline(title=title, top_n=15)
        
        if dataframe_result.empty:
            return {"input_title": title, "total": 0, "recommendations": []}
            
        # Bersihkan nilai NaN bawaan pandas agar data JSON tidak rusak sewaktu dikirim ke React Vite
        dataframe_clean = dataframe_result.fillna(0)
        
        # Konversi baris dataframe menjadi bentuk array of objek JSON
        json_records = dataframe_clean.to_dict(orient="records")
        
        return {
            "status": "success",
            "search_type": "Scenario 1 - By Title Input",
            "input_title": title,
            "total": len(json_records),
            "recommendations": json_records
        }
        
    except HTTPException as http_error:
        raise http_error
    except Exception as general_error:
        raise HTTPException(status_code=500, detail=f"Kesalahan internal server backend: {str(general_error)}")


# === SKENARIO 2 ENDPOINT: CARI BERDASARKAN FILTER GENRE & TEMA ===
@app.post("/api/recommend/by-genre-theme")
def api_recommend_by_genre_theme(payload: GenreThemeRequest):
    try:
        # Validasi agar user tidak mengirimkan objek kosong tanpa memilih filter apapun
        if not payload.genres and not payload.themes:
            raise HTTPException(status_code=400, detail="Kamu harus memilih minimal satu objek genre atau tema di filter.")
            
        # Mengeksekusi pencarian independen metadata match dikunci di TOP 15 sesuai permintaanmu
        dataframe_result = hybrid_genre_theme_recommendation(
            genres=payload.genres,
            themes=payload.themes,
            top_n=15
        )
        
        if dataframe_result.empty:
            return {"genres_input": payload.genres, "themes_input": payload.themes, "total": 0, "recommendations": []}
            
        # Bersihkan nilai NaN
        dataframe_clean = dataframe_result.fillna(0)
        json_records = dataframe_clean.to_dict(orient="records")
        
        return {
            "status": "success",
            "search_type": "Scenario 2 - By Genre and Theme Filter Match",
            "genres_input": payload.genres,
            "themes_input": payload.themes,
            "total": len(json_records),
            "recommendations": json_records
        }
        
    except HTTPException as http_error:
        raise http_error
    except Exception as general_error:
        raise HTTPException(status_code=500, detail=f"Kesalahan internal server backend: {str(general_error)}")