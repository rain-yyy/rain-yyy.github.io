// Google Drive Picker 相关配置与功能
// 客户端ID和API密钥
const CLIENT_ID = '113700128598-1fva8o232539udn6b2guoh08o1837pdj.apps.googleusercontent.com';
const API_KEY = 'AIzaSyDwbPqysPzSpLfq5Nu4w6yCDcA2pM0bv-8';
const APP_ID = '113700128598';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// 全局变量
let tokenClient;
let accessToken = null;
let pickerInited = false;
let gisInited = false;
let gapiInited = false;
let selectedFiles = [];

// GAPI 加载完成的回调
function gapiLoaded() {
  gapi.load('client:picker', initializePicker);
}

// 初始化 Picker
async function initializePicker() {
  try {
    await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
    pickerInited = true;
    gapiInited = true;
    console.log("GAPI and Picker initialized successfully");
    if (typeof maybeEnableButtons === 'function') {
      maybeEnableButtons();
    }
  } catch (error) {
    console.error("Error initializing GAPI:", error);
    if (typeof showDriveError === 'function') {
      showDriveError("初始化 Google API 时出错: " + (error.message || "未知错误"));
    }
  }
}

// GIS 加载完成的回调
function gisLoaded() {
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: '', // 将在运行时定义
      error_callback: (err) => {
        console.error("Token client error:", err);
        if (typeof showDriveError === 'function') {
          showDriveError(`认证错误: ${err.type} - ${err.message || "未知错误"}`);
        }
      }
    });
    gisInited = true;
    console.log("GIS initialized successfully");
    if (typeof maybeEnableButtons === 'function') {
      maybeEnableButtons();
    }
  } catch (error) {
    console.error("Error initializing token client:", error);
    if (typeof showDriveError === 'function') {
      showDriveError("初始化授权客户端时出错: " + (error.message || "未知错误"));
    }
  }
}

// 检查API初始化状态并启用按钮
function maybeEnableButtons() {
  if (gapiInited && gisInited && pickerInited) {
    console.log("All Google APIs are initialized");
    const googleDriveButton = document.getElementById('google-drive-button');
    if (googleDriveButton) {
      googleDriveButton.style.opacity = '1';
      googleDriveButton.style.pointerEvents = 'auto';
    }
    
    const statusDiv = document.getElementById('google-drive-status');
    if (statusDiv && statusDiv.textContent && statusDiv.textContent.includes('正在初始化')) {
      statusDiv.textContent = '';
      statusDiv.className = 'drive-status';
    }
  }
}

// 处理 Drive 认证点击
function handleDriveAuthClick() {
  console.log('Drive auth button clicked');
  
  if (!gapiInited || !gisInited || !pickerInited) {
    console.log('APIs not initialized yet, reinitializing...');
    showDriveStatus('正在初始化Google API，请稍候...');
    return;
  }
  
  showDriveStatus('正在请求授权...');
  
  tokenClient.callback = async (response) => {
    if (response.error !== undefined) {
      console.error('Authorization error:', response.error);
      showDriveError(`授权失败: ${response.error}`);
      return;
    }
    
    accessToken = response.access_token;
    console.log('Authorization successful');
    showDriveSuccess('已成功授权！请选择您想要的特定文件或文件夹');
    
    // 创建并显示Google Picker
    await createPicker();
  };
  
  if (accessToken === null) {
    // 需要授权，请求同意
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    // 已有token，可以直接打开选择器
    tokenClient.requestAccessToken({prompt: ''});
  }
}

// 创建Google Picker
function createPicker() {
  if (!pickerInited || !gapiInited) {
    showDriveError('Google Picker 未初始化，请刷新页面重试');
    return;
  }
  
  if (!accessToken) {
    showDriveError('未授权访问。请点击"连接Google Drive"按钮重试');
    return;
  }
  
  showDriveStatus('正在打开文件选择器...');
  
  try {
    // 特别创建一个只显示文件夹的视图
    const folderView = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true)
      .setMode(google.picker.DocsViewMode.LIST);
    
    // 创建Picker
    const picker = new google.picker.PickerBuilder()
      .setTitle('选择要授权的文件或文件夹')
      .setOAuthToken(accessToken)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .addView(folderView)
      .setCallback(pickerCallback)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .build();
      
    picker.setVisible(true);
  } catch (error) {
    console.error("Error creating Picker:", error);
    showDriveError(`创建文件选择器时出错: ${error.message || "未知错误"}`);
  }
}

// Google Picker 回调
async function pickerCallback(data) {
  if (data.action === google.picker.Action.PICKED) {
    const documents = data[google.picker.Response.DOCUMENTS];
    
    if (!documents || documents.length === 0) {
      showDriveStatus('未选择任何文件或文件夹');
      return;
    }
    
    selectedFiles = documents;
    showDriveSuccess(`已选择 ${documents.length} 个项目，正在处理...`);
    
    // 处理选中的文件/文件夹
    const selectedItems = document.createElement('div');
    selectedItems.className = 'drive-file-list';
    
    let text = '';
    let fileDetails = [];
    
    for (const doc of documents) {
      const docId = doc[google.picker.Document.ID];
      const docName = doc[google.picker.Document.NAME];
      const mimeType = doc[google.picker.Document.MIME_TYPE];
      
      fileDetails.push({
        id: docId,
        name: docName,
        mimeType: mimeType
      });
      
      const isFolder = mimeType === 'application/vnd.google-apps.folder';
      const icon = isFolder ? '📁' : '📄';
      
      // 获取更多文件详情
      try {
        const response = await gapi.client.drive.files.get({
          'fileId': docId,
          'fields': 'id,name,mimeType,webViewLink'
        });
        
        const item = document.createElement('div');
        item.className = 'drive-file-item';
        
        item.innerHTML = `
          <div class="drive-file-icon">${icon}</div>
          <div class="drive-file-info">
            <div class="drive-file-name">${response.result.name}</div>
            <div class="drive-file-meta">
              ${isFolder ? '文件夹' : '文件'} - 仅授权访问此项目
            </div>
          </div>
        `;
        
        selectedItems.appendChild(item);
        
        text += `\n${isFolder ? '文件夹' : '文件'}: ${response.result.name}\n`;
        text += `ID: ${response.result.id}\n`;
        text += `链接: ${response.result.webViewLink}\n`;
        
        // 添加系统消息，确保addSystemMessage函数存在
        if (typeof addSystemMessage === 'function') {
          addSystemMessage(`已授权访问: ${response.result.name}（仅限此项目）`);
        }
      } catch (err) {
        console.error(`获取文件详情出错:`, err);
        showDriveError(`获取文件 "${docName}" 详情时出错: ${err.message || "未知错误"}`);
      }
    }
    
    const statusDiv = document.getElementById('google-drive-status');
    statusDiv.innerHTML = `
      <div class="drive-status success">
        <i>📁</i>
        <span>已选择 ${documents.length} 个项目，仅授权访问这些特定内容</span>
      </div>
      <div style="margin-top: 8px; font-size: 12px; color: var(--muted-foreground);">
        注意：我们只能访问您选择的这些特定文件/文件夹，无法访问您 Google Drive 中的其他内容
      </div>
    `;
    
    statusDiv.appendChild(selectedItems);
    
    // 处理选中的文件/文件夹
    processSelectedItems(documents);
  } else if (data.action === google.picker.Action.CANCEL) {
    showDriveStatus('已取消选择，未授权任何文件');
  }
}

// 处理已选择的项目（批量）
function processSelectedItems(items) {
  showDriveStatus('正在处理选中的项目...');

  console.log(documents);
  

}

// 状态显示函数
function showDriveStatus(message) {
  const statusDiv = document.getElementById('google-drive-status');
  if (statusDiv) {
    statusDiv.className = 'drive-status';
    statusDiv.textContent = message;
  }
}

function showDriveError(message) {
  const statusDiv = document.getElementById('google-drive-status');
  if (statusDiv) {
    statusDiv.innerHTML = `
      <div class="error-message">
        <i>⚠️</i>
        <div>
          <div style="margin-bottom: 8px;">${message}</div>
          <div style="font-size: 12px; opacity: 0.8;">
            当前域名: ${window.location.origin}<br>
            请确保此域名已添加到 Google Cloud Console 的授权来源列表中
          </div>
        </div>
      </div>
    `;
    statusDiv.className = 'drive-status error';
  }
}

function showDriveSuccess(message) {
  const statusDiv = document.getElementById('google-drive-status');
  if (statusDiv) {
    statusDiv.className = 'drive-status success';
    statusDiv.textContent = message;
  }
}

// 初始化函数 - 在DOMContentLoaded事件中调用
function initGoogleDrivePicker() {
  const googleDriveButton = document.getElementById('google-drive-button');
  if (googleDriveButton) {
    // 初始禁用按钮，直到API加载完成
    googleDriveButton.style.opacity = '0.5';
    googleDriveButton.style.pointerEvents = 'none';
    
    // 添加点击事件
    googleDriveButton.addEventListener('click', handleDriveAuthClick);
  }
  
  // 如果API已经初始化，启用按钮
  maybeEnableButtons();
}

// 导出函数供外部使用
window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;
window.initGoogleDrivePicker = initGoogleDrivePicker;
window.pickerCallback = pickerCallback;
window.createPicker = createPicker;
window.handleDriveAuthClick = handleDriveAuthClick;