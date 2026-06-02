package com.teraim.strand;


import java.util.Timer;
import java.util.TimerTask;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.view.LayoutInflater;
import android.view.Menu;
import android.view.MenuItem;
import android.widget.EditText;

import com.teraim.strand.exporter.ActivityExport;

public class M_Activity extends Activity {


	protected Provyta py = Strand.getCurrentProvyta(this);

	private Timer timer;

	private MenuItem saveStat;
	private boolean hideMostItems = false;
	private Context context;

	@Override
	public boolean onCreateOptionsMenu(Menu menu) {
		super.onCreateOptionsMenu(menu);
		if(hideMostItems){
			menu.add(0, 0, 0, "Exportera").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
		}
		saveStat = menu.add(0, 0, 0, "");
		saveStat.setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
		menu.add(0, 1, 1, "R: "+py.getRuta()).setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
		//mnu1.setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
		menu.add(0, 2, 2, "PY: "+py.getProvyta()).setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);		
		menu.add(0, 3, 3, "Blå Lapp").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
		menu.add(0, 4, 4, "Extra Bild").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
//		menu.add(0, 4, 4, "Exportera").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
		return true;
	}



	class CheckSaveStatusTask extends TimerTask {
		public void run() {
			runOnUiThread(new Runnable() {
			     public void run() {
			    	 if(saveStat!=null) {
						if(py.isSaved())
							saveStat.setIcon(R.drawable.saved);
						else {
							saveStat.setIcon(null);
							saveStat.setTitle("Unsaved");
						}
			    	 }
			    }
			});
		}
	}



	@Override
	protected void onResume() {
		//Timer to update save status every second.
		timer = new Timer();
		timer.scheduleAtFixedRate(new CheckSaveStatusTask(),0, 1000);
		this.context = this;
		super.onResume();
	}

	@Override
	protected void onStop() {
		super.onStop();
		timer.cancel();
		timer = null;
	}

	@Override
	public boolean onOptionsItemSelected(MenuItem item)
	{

		switch (item.getItemId()) {

		case 0:			
			break;
		case 1:
			break;
		case 3:
			
			AlertDialog.Builder alert = new AlertDialog.Builder(this);
			alert.setTitle("Blå lapp");	

			final EditText inputView =(EditText)LayoutInflater.from(this).inflate(R.layout.blue, null);

			inputView.setText(py.getBlålapp());

			alert.setPositiveButton("Spara", new DialogInterface.OnClickListener() {
				public void onClick(DialogInterface dialog, int whichButton) {				  
					py.setBlålapp(inputView.getText().toString());
				}

			});
			alert.setNegativeButton("Avbryt", new DialogInterface.OnClickListener() {
				public void onClick(DialogInterface dialog, int whichButton) {
					// Canceled.
				}
			});	
			Dialog d = alert.setView(inputView).create();
			//WindowManager.LayoutParams lp = new WindowManager.LayoutParams();
			//lp.copyFrom(d.getWindow().getAttributes());
			//lp.height = WindowManager.LayoutParams.FILL_PARENT;
			//lp.height = 600;

			d.show();
			break;
			case 4: // Extra bilder
				Intent intent = new Intent(context, ActivityExtraImages.class);
				startActivity(intent);
				break;
//			case 4: //exportera
//				Intent intent = new Intent(this, ActivityExport.class);
//				startActivity(intent);
//				break;


		}
		return false;

	}



}
