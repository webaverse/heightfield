import metaversefile from 'metaversefile';
import { procgenAssetsBaseUrl } from './assets.js';

// TODO:
// 1. Add a button that enables and disables the different procgen layers
// 2. Add a list of assets per layer
// 3. Add a button to add a new asset to the list
// 4. Add a button to remove an asset from the list
// 5. Add a button to regenerate world
// 6. store and recall from local storage
// 7. Add a button to save the list to a file
// 8. Add a button to load a list from a file
// 9. Add a button to refresh from defaults

export const toggleWindowEvent = e => {
  if (e.shiftKey && e.keyCode === 222) {
    window.style.display = window.style.display === 'none' ? 'block' : 'none';
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

  // for each grass in grasses, make a list item with the grass name
  assets.forEach(asset => {
    console.log(asset);
    const assetListItem = document.createElement('li');
    assetListItem.innerText = asset.replace(procgenAssetsBaseUrl + name.toLowerCase() + "/", '');
    assetListItems.appendChild(assetListItem);
  });

  assetList.appendChild(assetListItems);

  // append grasses list to "procgen-window" div
  procgenWindow.appendChild(assetList);
}

export const makeWindow = ({ grasses, vegetation, ores, litter }) => {
  const app = document.getElementById('app');
  const procgenWindow = document.createElement('div', { id: 'procgen-window' });
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

  assetBox('grass', grasses, procgenWindow);
  assetBox('vegetation', vegetation, procgenWindow);
  assetBox('ores', ores, procgenWindow);
  // assetBox('litter', litter, procgenWindow);

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