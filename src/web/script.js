class ImageComparisonApp {
    constructor() {
        this.data = null;
        this.filteredResults = [];
        this.displayedResults = [];
        this.currentPage = 0;
        this.itemsPerPage = 20;
        this.currentSort = 'name';
        this.searchQuery = '';
        
        this.elements = {
            loading: document.getElementById('loading'),
            noData: document.getElementById('no-data'),
            imageGrid: document.getElementById('image-grid'),
            totalCount: document.getElementById('total-count'),
            avgCompression: document.getElementById('avg-compression'),
            lastUpdated: document.getElementById('last-updated'),
            searchInput: document.getElementById('search-input'),
            sortSelect: document.getElementById('sort-select'),
            loadMoreBtn: document.getElementById('load-more'),
            modal: document.getElementById('image-modal'),
            modalImage: document.getElementById('modal-image'),
            modalInfo: document.getElementById('modal-info'),
            modalTabs: document.querySelectorAll('.tab-button'),
            closeModal: document.querySelector('.close')
        };
        
        this.currentModalData = null;
        this.currentModalTab = 'original';
        
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.render();
    }

    async loadData() {
        try {
            const response = await fetch('../../results.json');
            if (!response.ok) {
                throw new Error('results.jsonが見つかりません');
            }
            this.data = await response.json();
            this.filteredResults = [...this.data.results];
            this.updateStats();
            this.hideLoading();
        } catch (error) {
            console.error('データの読み込みエラー:', error);
            this.showNoData();
        }
    }

    setupEventListeners() {
        // 検索
        this.elements.searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.filterAndSort();
        });

        // ソート
        this.elements.sortSelect.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.filterAndSort();
        });

        // さらに読み込む
        this.elements.loadMoreBtn.addEventListener('click', () => {
            this.loadMore();
        });

        // モーダル関連（既存のモーダル機能を保持）
        if (this.elements.closeModal) {
            this.elements.closeModal.addEventListener('click', () => {
                this.closeModal();
            });
        }

        if (this.elements.modal) {
            this.elements.modal.addEventListener('click', (e) => {
                if (e.target === this.elements.modal) {
                    this.closeModal();
                }
            });
        }

        // モーダルタブ
        this.elements.modalTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabType = e.target.dataset.tab;
                this.switchModalTab(tabType);
            });
        });

        // ESCキーでモーダルを閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.modal && this.elements.modal.style.display === 'block') {
                this.closeModal();
            }
        });
    }

    updateStats() {
        if (!this.data) return;

        const results = this.data.results;
        const validResults = results.filter(r => r.avif.success && r.webp.success);
        
        this.elements.totalCount.textContent = results.length;
        
        if (validResults.length > 0) {
            const avgAvifCompression = validResults.reduce((sum, r) => sum + r.avif.compressionRatio, 0) / validResults.length;
            const avgWebpCompression = validResults.reduce((sum, r) => sum + r.webp.compressionRatio, 0) / validResults.length;
            const avgCompression = (avgAvifCompression + avgWebpCompression) / 2;
            this.elements.avgCompression.textContent = `${Math.round(avgCompression)}%`;
        }

        if (this.data.timestamp) {
            const date = new Date(this.data.timestamp);
            this.elements.lastUpdated.textContent = date.toLocaleString('ja-JP');
        }
    }

    hideLoading() {
        this.elements.loading.style.display = 'none';
        this.elements.imageGrid.style.display = 'block';
    }

    showNoData() {
        this.elements.loading.style.display = 'none';
        this.elements.noData.style.display = 'block';
    }

    filterAndSort() {
        if (!this.data) return;

        // フィルタリング
        this.filteredResults = this.data.results.filter(result => {
            return result.original.path.toLowerCase().includes(this.searchQuery);
        });

        // ソート
        this.filteredResults.sort((a, b) => {
            switch (this.currentSort) {
                case 'name':
                    return a.original.path.localeCompare(b.original.path);
                case 'size':
                    return b.original.size - a.original.size;
                case 'avif-compression':
                    return b.avif.compressionRatio - a.avif.compressionRatio;
                case 'webp-compression':
                    return b.webp.compressionRatio - a.webp.compressionRatio;
                default:
                    return 0;
            }
        });

        this.currentPage = 0;
        this.displayedResults = [];
        this.render();
    }

    loadMore() {
        const startIndex = this.currentPage * this.itemsPerPage;
        const endIndex = Math.min(startIndex + this.itemsPerPage, this.filteredResults.length);
        
        const newItems = this.filteredResults.slice(startIndex, endIndex);
        this.displayedResults.push(...newItems);
        this.currentPage++;

        this.renderNewItems(newItems);
        this.updateLoadMoreButton();
    }

    render() {
        this.elements.imageGrid.innerHTML = '';
        this.displayedResults = [];
        this.loadMore();
    }

    renderNewItems(items) {
        items.forEach(result => {
            const itemElement = this.createImageItem(result);
            this.elements.imageGrid.appendChild(itemElement);
        });
    }

    createImageItem(result) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'image-item';

        itemDiv.innerHTML = `
            <div class="image-header">
                <div class="image-name">${result.original.path}</div>
            </div>
            <div class="image-comparison">
                ${this.createComparisonColumn('original', 'オリジナル', result.original, result)}
                ${this.createComparisonColumn('avif', 'AVIF', result.avif, result)}
                ${this.createComparisonColumn('webp', 'WebP', result.webp, result)}
            </div>
        `;

        return itemDiv;
    }

    createComparisonColumn(type, label, data, fullResult) {
        const isSuccess = data.success !== false;
        const imagePath = type === 'original' 
            ? `../../contents/${fullResult.original.path}`
            : `../../${data.path}`;

        if (!isSuccess) {
            return `
                <div class="comparison-item">
                    <div class="format-label ${type}">${label}</div>
                    <div class="image-preview-container">
                        <div class="error-indicator">変換エラー</div>
                    </div>
                    <div class="image-info">
                        <div class="file-size">-</div>
                    </div>
                </div>
            `;
        }

        const compressionClass = this.getCompressionClass(data.compressionRatio);
        const compressionText = type === 'original' ? '' : `
            <div class="compression-ratio ${compressionClass}">
                ${data.compressionRatio > 0 ? '-' : '+'}${Math.abs(data.compressionRatio)}%
            </div>
        `;

        return `
            <div class="comparison-item">
                <div class="format-label ${type}">${label}</div>
                <div class="image-preview-container">
                    <img class="image-preview" 
                         src="${imagePath}" 
                         alt="${label}" 
                         loading="lazy"
                         onclick="app.openModal('${type}', ${JSON.stringify(fullResult).replace(/"/g, '&quot;')})">
                </div>
                <div class="image-info">
                    <div class="file-size">${data.sizeFormatted}</div>
                    ${compressionText}
                </div>
            </div>
        `;
    }

    getCompressionClass(ratio) {
        if (ratio >= 50) return 'good';
        if (ratio >= 20) return 'average';
        return 'poor';
    }

    updateLoadMoreButton() {
        const hasMore = this.displayedResults.length < this.filteredResults.length;
        this.elements.loadMoreBtn.style.display = hasMore ? 'block' : 'none';
    }

    openModal(type, result) {
        if (!this.elements.modal) return;
        
        this.currentModalData = result;
        this.currentModalTab = type;
        this.switchModalTab(type);
        this.elements.modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    switchModalTab(type) {
        if (!this.currentModalData || !this.elements.modalImage || !this.elements.modalInfo) return;

        this.currentModalTab = type;
        
        // タブの状態更新
        this.elements.modalTabs.forEach(tab => {
            if (tab.dataset.tab === type) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // 画像とデータの取得
        let imagePath, data, label;
        switch (type) {
            case 'original':
                imagePath = `../../contents/${this.currentModalData.original.path}`;
                data = this.currentModalData.original;
                label = 'オリジナル';
                break;
            case 'avif':
                imagePath = `../../${this.currentModalData.avif.path}`;
                data = this.currentModalData.avif;
                label = 'AVIF';
                break;
            case 'webp':
                imagePath = `../../${this.currentModalData.webp.path}`;
                data = this.currentModalData.webp;
                label = 'WebP';
                break;
        }

        // 画像の更新
        this.elements.modalImage.src = imagePath;
        this.elements.modalImage.alt = label;

        // 情報の更新
        this.updateModalInfo(type, data, label);
    }

    updateModalInfo(type, data, label) {
        if (!this.elements.modalInfo) return;
        
        const config = this.data?.config || {};
        let configInfo = '';
        
        if (type === 'avif' && config.avif) {
            configInfo = `
                <div><strong>品質:</strong> ${config.avif.quality}</div>
                <div><strong>速度:</strong> ${config.avif.speed}</div>
            `;
        } else if (type === 'webp' && config.webp) {
            configInfo = `
                <div><strong>品質:</strong> ${config.webp.quality}</div>
                <div><strong>メソッド:</strong> ${config.webp.method}</div>
                <div><strong>メタデータ:</strong> ${config.webp.metadata}</div>
            `;
        }

        const compressionInfo = type !== 'original' && data.compressionRatio !== undefined ? `
            <div><strong>圧縮率:</strong> 
                <span class="compression-ratio ${this.getCompressionClass(data.compressionRatio)}">
                    ${data.compressionRatio > 0 ? '-' : '+'}${Math.abs(data.compressionRatio)}%
                </span>
            </div>
        ` : '';

        this.elements.modalInfo.innerHTML = `
            <h4>${label}</h4>
            <div><strong>ファイルサイズ:</strong> ${data.sizeFormatted}</div>
            ${compressionInfo}
            ${configInfo}
            <div><strong>パス:</strong> ${type === 'original' ? this.currentModalData.original.path : data.path}</div>
        `;
    }

    closeModal() {
        if (!this.elements.modal) return;
        
        this.elements.modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        this.currentModalData = null;
    }
}

// アプリケーション初期化
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ImageComparisonApp();
});
