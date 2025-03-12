	// ✅ 讓 `stopLoadingGitHub` 變數可用於所有函式
	let stopLoadingGitHub = localStorage.getItem("stopLoadingGitHub") === "true";
	document.addEventListener("DOMContentLoaded", function() {
		const modal = document.getElementById("imageModal");
		if (modal) {
			modal.style.display = "none"; // 確保 modal 預設隱藏
		}
	});
	window.onload = function() {
		console.log("🔵 頁面載入完成，初始化地圖...");
		const fileInput = document.getElementById("fileInput");
		const clearMarkersBtn = document.getElementById("clearMarkers");
		const photoList = document.getElementById("photoList");
		if (!fileInput || !clearMarkersBtn || !photoList) {
			console.error("❌ 找不到某些 HTML 元素，請檢查 HTML！");
			return;
		}
		let map = L.map("map").setView([24.46, 118.35], 12); //改中心點
		L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);

		// 🚀 只有當 `stopLoadingGitHub` 為 false 時，才載入 GitHub JSON
		if (!stopLoadingGitHub) {
			console.log("✅ 載入 GitHub JSON...");
			loadAllMarkersFromGitHub();
		} else {
			console.log("⏹️ 已按過 `clearMarkers`，不載入 GitHub JSON");
		}
		

		function showNotification(message) {
			let notification = document.createElement("div");
			notification.className = "notification";
			notification.innerHTML = `
            <span style="margin-right:10px;">⚠️ ${message}</span>
            <button onclick="this.parentElement.remove()" 
                    style="border:none; background:none; color:white; cursor:pointer;">✖</button>
        `;
			// 🔥 設定通知樣式，讓它不會影響其他操作
			Object.assign(notification.style, {
				position: "fixed",
				top: "20px",
				right: "20px",
				backgroundColor: "#333",
				color: "white",
				padding: "10px 20px",
				borderRadius: "8px",
				boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
				zIndex: "9999", // 讓它顯示在最上層
				display: "flex",
				alignItems: "center"
			});
			document.body.appendChild(notification);
			// 3秒後自動消失
			setTimeout(() => {
				if (notification) notification.remove();
			}, 3000);
		}

		function extractPhotoDate(exifDate) {
			if (!exifDate) return "未知日期"; // 防止 undefined
			let parts = exifDate.split(" "); // 分割日期與時間
			let dateParts = parts[0].split(":"); // 拆分 `YYYY:MM:DD`
			if (dateParts.length === 3) {
				return `${dateParts[0]}年${dateParts[1]}月${dateParts[2]}日`; // 格式化為 "X年Y月Z日"
			}
			return "未知日期"; // 如果格式不對，回傳預設值
		}
		fileInput.addEventListener("change", function(event) {
			let files = event.target.files;
			for (let file of files) {
				let reader = new FileReader();
				reader.onload = function(e) {
					let img = new Image();
					img.src = e.target.result;
					img.onload = async function() {
						EXIF.getData(img, async function() {
							let lat = EXIF.getTag(this, "GPSLatitude");
							let lon = EXIF.getTag(this, "GPSLongitude");
							let exifDate = EXIF.getTag(this, "DateTimeOriginal"); // 讀取 EXIF 拍攝時間
							let phototime = extractPhotoDate(exifDate);
							console.log("📸 讀取 EXIF 時間:", exifDate); // 確保有讀取到原始時間
							console.log("📅 格式化後的拍攝時間:", phototime);
							if (lat && lon) {
								let latitude = convertDMSToDD(lat);
								let longitude = convertDMSToDD(lon);
								// ✅ 確保 `compressImage()` 有被 `await`
								try {
									let compressedImg = await compressImage(img);
									saveMarker(latitude, longitude, compressedImg, phototime);
								} catch (error) {
									console.error("❌ 圖片壓縮失敗：", error);
								}
							} else {
								showNotification("照片不含 GPS 資訊");
								promptForGPS(img, phototime);
							}
						});
					};
				};
				reader.readAsDataURL(file);
			}
		});

		function compressImage(img, quality = 0.5, maxWidth = 800) { //壓縮
			return new Promise((resolve, reject) => {
				let canvas = document.createElement("canvas");
				let ctx = canvas.getContext("2d");
				let scaleFactor = maxWidth / img.width;
				if (scaleFactor > 1) scaleFactor = 1; // 確保不會放大圖片
				canvas.width = img.width * scaleFactor;
				canvas.height = img.height * scaleFactor;
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				console.log("🎨 嘗試壓縮圖片...");
				// 嘗試使用 WebP，如果失敗就改用 JPEG
				canvas.toBlob((blob) => {
					if (blob) {
						console.log("✅ WebP 壓縮成功！Blob:", blob);
						resolve(blob);
					} else {
						console.warn("⚠️ WebP 失敗，改用 JPEG");
						canvas.toBlob((jpegBlob) => {
							if (jpegBlob) {
								console.log("✅ JPEG 壓縮成功！Blob:", jpegBlob);
								resolve(jpegBlob);
							} else {
								console.error("❌ 轉換 Blob 失敗");
								reject(new Error("轉換 Blob 失敗"));
							}
						}, "image/jpeg", quality);
					}
				}, "image/webp", quality);
			});
		}
		// 🚀 當照片沒有 GPS 時，彈出輸入框
		function promptForGPS(img, phototime) {
			// 🔍 檢查是否已經存在 modal，避免重複
			let existingModal = document.querySelector(".gps-modal");
			if (existingModal) {
				alert("⚠️ 請先完成上一張照片的 GPS 填寫！");
				return;
			}
			let modal = document.createElement("div");
			modal.className = "gps-modal";
			modal.innerHTML = `
        <div class="gps-content">
            <h2>🚨 照片沒有 GPS 資訊，請手動輸入</h2>
            <img src="${img.src}" class="gps-preview">
            <label>經度 (Longitude): <input type="number" id="manualLongitude" step="0.00001"></label>
            <label>緯度 (Latitude): <input type="number" id="manualLatitude" step="0.00001"></label>
            <button id="saveGPS">✅ 儲存</button>
            <button id="cancelGPS">❌ 取消</button>
        </div>
    `;
			document.body.appendChild(modal);
			document.getElementById("cancelGPS").addEventListener("click", function() {
				document.body.removeChild(modal); // ✅ 移除輸入框
			});
			document.getElementById("saveGPS").addEventListener("click", async function() {
				let latitude = parseFloat(document.getElementById("manualLatitude").value);
				let longitude = parseFloat(document.getElementById("manualLongitude").value);
				if (!isNaN(latitude) && !isNaN(longitude)) {
					try {
						let compressedImg = await compressImage(img); // 🔥 等待壓縮完成
						phototime = phototime || new Date().toISOString().split("T")[0]; 						console.log("📅 手動輸入 GPS，使用當前時間:", phototime);
						saveMarker(latitude, longitude, compressedImg, phototime); // ✅ 傳入 Blob
						document.body.removeChild(modal);
					} catch (error) {
						console.error("❌ 圖片壓縮失敗：", error);
						alert("圖片壓縮失敗，請重試！");
					}
				} else {
					alert("❌ 請輸入有效的經緯度！");
				}
			});
		}
		
		// 📌 直接列出 JSON 檔案 URL，改用 GitHub Pages 讀取
const jsonUrls = [
    "https://piceayee.github.io/jsonhome/data/0310A.json",
	"https://piceayee.github.io/jsonhome/data/0310B.json",
	"https://piceayee.github.io/jsonhome/data/edit1-1.json",
    "https://piceayee.github.io/jsonhome/data/edit2-1.json",
    "https://piceayee.github.io/jsonhome/data/edit3-1.json"// 依此類推，可繼續擴展
];

// 逐個載入 JSON，確保順序執行
async function loadAllMarkersFromGitHub() {
    if (stopLoadingGitHub) {
        console.log("⏹️ 已按下清除標記，停止載入 GitHub JSON");
        return;
    }

    console.log("📥 開始逐步載入 JSON 檔案...");

    for (let url of jsonUrls) {
        try {
            console.log(`📤 載入 JSON: ${url}`);
            await loadMarkersFromJson(url);
        } catch (error) {
            console.error(`❌ 載入 JSON 失敗: ${url}`, error);
        }
    }

    console.log("✅ 所有 JSON 檔案載入完成！");
}

// 單獨載入一個 JSON 的函式
async function loadMarkersFromJson(url) {
    try {
        let response = await fetch(url);
        if (!response.ok) throw new Error(`❌ 無法獲取 JSON: ${url}`);
        
        let data = await response.json();
        console.log(`✅ 成功載入 JSON: ${url}`, data);
        
        if (!Array.isArray(data)) {
            throw new Error("❌ JSON 格式錯誤，應該是陣列");
        }

        // 逐一將標記加入地圖
        data.forEach(markerData => addMarkerToMap(markerData));
    } catch (error) {
        console.error(`❌ 載入 JSON 失敗: ${url}`, error);
    }
}

// 啟動載入
loadAllMarkersFromGitHub();
		//03102200施工範圍//
		let markers = []; // 儲存所有標記
		function addMarkerToMap(markerData) {
			let markerColor = "blue"; // 預設藍色
			if (markerData.categories) {
				if (markerData.categories.includes("花磚＆裝飾")) {
					markerColor = "red";
				} else if (markerData.categories.includes("洋樓＆房舍")) {
					markerColor = "black";
				} else if (markerData.categories.includes("風獅爺")) {
					markerColor = "yellow";
				} else if (markerData.categories.includes("軍事")) {
					markerColor = "green";
				} else if (markerData.categories.includes("其他")) {
					markerColor = "blue";

				}
			}
			let marker = L.marker([markerData.latitude, markerData.longitude], {
				icon: L.icon({
					iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${markerColor}.png`,
					iconSize: [25, 41],
					iconAnchor: [12, 41],
					popupAnchor: [1, -34]
				}),
				categories: markerData.categories || []
			}).addTo(map).bindPopup(`
        <div class="popup-content">
            <strong>${markerData.name}</strong><br>
            <img src="${markerData.image}" width="300"><br>
            📅 拍攝日期: ${markerData.date || "未知日期"}<br>
            GPS: ${markerData.latitude.toFixed(5)}, ${markerData.longitude.toFixed(5)}
            </div>
            `).on("click", function() {
	let currentZoom = map.getZoom(); // 取得目前地圖的縮放層級
    let targetZoom = 17; // 設定目標縮放層級

	
	// 動態調整緯度偏移量
	let latOffset = 0;
	if (currentZoom === 17) {
		latOffset = 0.003;
	} else if (currentZoom === 18) {
		latOffset = 0.0015;
	}
    console.log("🔍 目前縮放層級:", currentZoom);


		// 確保 Zoom < 17 時仍然可以正常運作
	if (currentZoom < targetZoom) {
		// 如果目前縮放層級小於 15，才執行縮放
		map.flyTo([markerData.latitude + 0.003, markerData.longitude], targetZoom, { duration: 0.8 });
	} else {
		// 如果目前縮放已經夠大，只移動地圖但不改變縮放
		map.panTo([markerData.latitude + latOffset, markerData.longitude]);
	}

});

			// 🔹 確保標籤區塊內容
			let tagHtml = markerData.categories && markerData.categories.length > 0 
			? markerData.categories.map(cat => `<span class="photo-tag ${getCategoryClass(cat)}">${cat}</span>`).join(" ") 
			: `<span class="photo-tag no-category">未分類</span>`;



			// ✅ 手動加入 categories 屬性
			marker.categories = markerData.categories || [];
			// ✅ 將標記加入全域 `markers` 陣列
			markers.push(marker);
			marker.id = markerData.id; // ✅ 確保標記有 ID
			markers.push(marker); // ✅ 儲存到全域 `markers` 陣列
			let listItem = document.createElement("div");
			listItem.className = "photo-item";
			listItem.setAttribute("data-id", markerData.id); //新加26
			listItem.innerHTML = `
        <img src="${markerData.image}" class="thumbnail">
        <div class="photo-info">
            <input type="text" class="photo-name" placeholder="輸入照片名稱" data-id="${markerData.id}" value="${markerData.name}">
            <div class="category-tags">${tagHtml}</div> <!-- ✅ 新增標籤 -->
			<div class="category-selection">
                <label><input type="checkbox" value="花磚＆裝飾"> 花磚＆裝飾</label>
                <label><input type="checkbox" value="洋樓＆房舍"> 洋樓＆房舍</label>
                <label><input type="checkbox" value="風獅爺"> 風獅爺</label>
				<label><input type="checkbox" value="軍事"> 軍事</label>
				<label><input type="checkbox" value="其他"> 其他</label>
            </div>
            <button class="go-to-marker">查看</button>
            <button class="delete-photo">刪除</button>
        </div>
    `;
		function getCategoryClass(category) {
			switch (category) {
				case "花磚＆裝飾":
					return "tag-red";  // 紅色
				case "洋樓＆房舍":
					return "tag-orange"; // 黑色
				case "風獅爺":
					return "tag-yellow"; // 綠色
				case "軍事":
					return "tag-green"; // 綠色
				case "其他":
					return "tag-blue"; // 綠色
				default:
					return "tag-purple"; // 未分類（灰色）
			}
		}

			// ✅ 恢復已選分類
			let checkboxes = listItem.querySelectorAll(".category-selection input");
			checkboxes.forEach(checkbox => {
				if (markerData.categories && markerData.categories.includes(checkbox.value)) {
					checkbox.checked = true;
				}
				checkbox.addEventListener("change", function() {
					let selectedCategories = Array.from(checkboxes).filter(checkbox => checkbox.checked).map(checkbox => checkbox.value);
					updateMarkerCategory(markerData.id, selectedCategories);
				});
			});
			// 綁定名稱變更事件
			let nameInput = listItem.querySelector(".photo-name");
			nameInput.addEventListener("focus", function() {
				if (nameInput.value === "未命名照片") {
					nameInput.value = ""; // 清空「未命名照片」，讓使用者直接輸入
				}
			});
			nameInput.addEventListener("change", function() {
				updateMarkerName(markerData.id, nameInput.value);
				marker.bindPopup(`  
            <div class="popup-content">
                <h3 class="popup-title">${markerData.name}</h3>
                <img src="${markerData.image}" width="300">
                <p>GPS: ${markerData.latitude.toFixed(5)}, ${markerData.longitude.toFixed(5)}</p>
            </div>
        `); //上面這段是要解決文字置中跟放大，但沒有順利解決0217
			});
			// 綁定查看按鈕事件
			listItem.querySelector(".go-to-marker").addEventListener("click", function() {
				map.flyTo([markerData.latitude + 0.01, markerData.longitude], 15, {
					duration: 0.8
				});
				marker.openPopup();
				document.getElementById("map").scrollIntoView({
					behavior: "smooth"
				});
			});
			listItem.querySelector(".thumbnail").addEventListener("click", function() {
				map.flyTo([markerData.latitude + 0.0105, markerData.longitude], 15, {
					duration: 0.8
				});
				marker.openPopup();
			});
			// 綁定刪除按鈕事件
			listItem.querySelector(".delete-photo").addEventListener("click", function() {
				deleteMarker(markerData.id, listItem, marker);
			});
			// ✅ 讓最新上傳的照片排在最左邊
			let photoList = document.getElementById("photoList");
			photoList.prepend(listItem); // **使用 prepend() 而不是 appendChild()**
			return marker; //加這串，上傳圖便時才能啟動Popup
		}

		// 獲取 modal 元素
		const modal = document.getElementById("imageModal");
		const fullImage = document.getElementById("fullImage");
		const closeBtn = document.querySelector(".close");
		// 監聽所有 popup 內的圖片點擊事件
		document.addEventListener("click", function(event) {
			if (event.target.tagName === "IMG" && event.target.closest(".leaflet-popup-content")) {
				fullImage.src = event.target.src; // 設定放大的圖片
				modal.style.display = "flex"; // 顯示 modal
			}
		});
		closeBtn.addEventListener("click", function() {
			modal.style.display = "none";
		});

		modal.addEventListener("click", function(event) {
			if (event.target === modal) {
				modal.style.display = "none";
			}
		});


	

		function convertDMSToDD(dms) {
			return dms[0] + dms[1] / 60 + dms[2] / 3600;
		}

		
		function filterMarkers() {
			let selectedCategories = Array.from(document.querySelectorAll(".category-filter:checked")).map(input => input.value);
			markers.forEach(marker => {
				let markerCategories = marker.categories || [];
				let isVisible = false;
				if (selectedCategories.includes("未分類")) {
					isVisible = markerCategories.length === 0; // 沒有分類的標記
				} else if (selectedCategories.length > 0) {
					isVisible = selectedCategories.some(category => markerCategories.includes(category));
				} else {
					isVisible = true; // 若無選擇任何篩選條件，顯示所有標記
				}
				// ✅ 地圖上的標記顯示或隱藏
				if (isVisible) {
					marker.addTo(map);
				} else {
					map.removeLayer(marker);
				}
				// ✅ 照片列表同步篩選
				let photoItem = document.querySelector(`.photo-item[data-id="${marker.id}"]`);
				console.log(`檢查標記 ID: ${marker.id}, 是否找到對應照片？`, photoItem);
				if (photoItem) {
					console.log(`設定照片列表顯示狀態: ${isVisible ? "顯示" : "隱藏"}`);
					photoItem.style.display = isVisible ? "flex" : "none";
				}
			});
		}
		// ✅ 讓篩選選單監聽變化，並執行 `filterMarkers()`
		document.querySelectorAll(".category-filter").forEach(input => {
			input.addEventListener("change", filterMarkers);
		});
	};
