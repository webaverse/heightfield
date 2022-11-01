import metaversefile from 'metaversefile';
import { procgenAssetsBaseUrl } from './assets.js';

// TODO:

// 3. Add a button to add a new asset to the list
// 4. Add a button to remove an asset from the list

// 6. store and recall from local storage
// 7. Add a button to save the list to a file
// 8. Add a button to load a list from a file
// 9. Add a button to refresh from defaults

export const toggleWindowEvent = e => {
  // bind shift+\ to toggle window
  if (e.shiftKey && e.keyCode === 220) {
    console.log('looking for procgen window');
    const procgenWindow = document.getElementById("procgen-window");
    procgenWindow.style.display = procgenWindow.style.display === 'none' ? 'block' : 'none';
  }
}


const assetBox = (name, assets, procgenWindow) => {
  // make a list of grasses with the heading grasses
  const assetList = document.createElement('div', { id: name + '-list' });
  assetList.style.display = 'block';
  assetList.style.padding = '10px';

  const assetListHeading = document.createElement('h3');
  assetListHeading.innerText = name.toUpperCase();
  assetList.appendChild(assetListHeading);

  // make a grass list
  const assetListItems = document.createElement('ul');

  function removeAsset(asset, el) {
    console.log("removing asset", asset);
    const index = assets.indexOf(asset);
    if (index > -1) {
      assets.splice(index, 1);
    }
    el.remove();
  }

  // for each grass in grasses, make a list item with the grass name
  assets.forEach(asset => {
    const assetListItem = document.createElement('li');
    assetListItem.innerText = asset.replace(procgenAssetsBaseUrl + name.toLowerCase() + "/", '');
    assetListItems.appendChild(assetListItem);

    // make a button to remove the asset from the list
    const removeAssetButton = document.createElement('button');
    removeAssetButton.innerText = 'remove';
    removeAssetButton.addEventListener('click', () => removeAsset(asset, assetListItem));
    assetListItem.appendChild(removeAssetButton);
  });

  assetList.appendChild(assetListItems);

  // append grasses list to "procgen-window" div
  procgenWindow.appendChild(assetList);
}

export const makeWindow = ({
    grasses,
    vegetation,
    ores,
    litter,
    createAppCallback,
    destroyAppCallback,
    regenerateAppCallback
  }) => {
  const app = document.getElementById('app');
  const procgenWindow = document.createElement('div');
  procgenWindow.id = 'procgen-window';
  // give window an id of procgen-window
  procgenWindow.style.position = 'absolute';
  procgenWindow.style.top = '200px';
  procgenWindow.style.left = '0px';
  procgenWindow.style.width = '400px';
  procgenWindow.style.height = '400px';
  procgenWindow.style.backgroundColor = 'rgba(0, 0, 0, .8)';
  procgenWindow.style.border = '1px solid #fff';
  procgenWindow.style.color = '#fff';
  procgenWindow.style.padding = '10px';
  procgenWindow.style.display = 'none'; // start hidden
  procgenWindow.style.overflowY = 'scroll';
  procgenWindow.style.overflowX = 'hidden';
  procgenWindow.style.zIndex = 1000;
  app.appendChild(procgenWindow);

  // bind shift+' to toggle window
  document.addEventListener('keydown', toggleWindowEvent);

  const closeButton = document.createElement('button');
  closeButton.innerHTML = 'Close';
  closeButton.style.width = '100%';
  closeButton.style.height = '50px';
  closeButton.style.marginBottom = '10px';
  closeButton.addEventListener('click', toggleWindow);
  procgenWindow.appendChild(closeButton);

  const destroyButton = document.createElement('button');
  destroyButton.innerHTML = 'Destroy World';
  destroyButton.style.width = '100%';
  destroyButton.style.height = '50px';
  destroyButton.style.marginBottom = '10px';
  destroyButton.addEventListener('click', destroyAppCallback);
  procgenWindow.appendChild(destroyButton);

  const createButton = document.createElement('button');
  createButton.innerHTML = 'Create World';
  createButton.style.width = '100%';
  createButton.style.height = '50px';
  createButton.style.marginBottom = '10px';
  createButton.addEventListener('click', createAppCallback);
  procgenWindow.appendChild(createButton);

  const regenerateButton = document.createElement('button');
  regenerateButton.innerHTML = 'Regenerate World';
  regenerateButton.style.width = '100%';
  regenerateButton.style.height = '50px';
  regenerateButton.style.marginBottom = '10px';
  regenerateButton.addEventListener('click', regenerateAppCallback);
  procgenWindow.appendChild(regenerateButton);

  assetBox('grass', grasses, procgenWindow);
  assetBox('vegetation', vegetation, procgenWindow);
  assetBox('ores', ores, procgenWindow);
  assetBox('litter', litter, procgenWindow);

  return procgenWindow;
};

export const destroyWindow = () => {
  const window = document.getElementById('procgen-window');
  if (window) {
    window.remove();
  }
  document.removeEventListener('keydown', toggleWindowEvent);
};

export const toggleWindow = () => {
  const window = document.getElementById('procgen-window');
  if (window.style.display === 'none') {
    window.style.display = 'block';
  } else {
    window.style.display = 'none';
  }
};