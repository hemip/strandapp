package com.teraim.strand;

import java.util.Timer;
import java.util.TimerTask;

import com.teraim.strand.M_Activity.CheckSaveStatusTask;
import com.teraim.strand.dataobjekt.ArtListaProvider;
import com.teraim.strand.utils.Constants;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Environment;
import android.preference.PreferenceManager;
import android.util.Log;
import android.view.MenuItem;

/**
 * 
 * @author Terje
 *
 * Class saving constants etc needed for this App globally.
 */
public class Strand {
	
	private static Timer timer = null;

	//Class for saving data regularly
	public static	class ContinousSave extends TimerTask {
		public void run() {
			if (currentProvyta!=null ) {
				if(!currentProvyta.isSaved())
					//Spara värden
					Persistent.onSave(currentProvyta);
			}
		}
	}



	public static class PersistenceHelper {
		public static final String UNDEFINED = "";
		SharedPreferences sp;
		public PersistenceHelper(Context ctx) {
			sp = PreferenceManager.getDefaultSharedPreferences(ctx);
			if (ctx == null)
				Log.e("Strand","Context null in getdefaultsharedpreferences!");
		}

		public String get(String key) {
			return sp.getString(key,UNDEFINED);
		}

		public void put(String key, String value) {
			sp.edit().putString(key,value).commit();
		}

	}

	private static Provyta currentProvyta=null;

	public static void setCurrentProvyta(Provyta py) {
		currentProvyta = py;
		//start save timer.
		if (timer == null) {
			timer = new Timer();
			timer.scheduleAtFixedRate(new ContinousSave(),30, 1000* Constants.SAVE_INTERVAL);
		}
	}

	public static Provyta getCurrentProvyta(Context c) {
		if(currentProvyta==null) {
			if (c==null)
				Log.e("Strand","CONTEXT was null in Strand!!");
			PersistenceHelper ph = new PersistenceHelper(c);
			Log.e("Strand","Provyta null in Stran.getCurrent..");
			//Try to load from saved PY_ID.
			String pycID = ph.get(Constants.KEY_CURRENT_PY);
			//load if exists..
			if (pycID!=PersistenceHelper.UNDEFINED)
				currentProvyta = Persistent.onLoad(pycID);

		} 
		return currentProvyta;
	}

	private static ArtListaProvider ap=null;

	public static ArtListaProvider getArtListaProvider() {
		return ap;
	}

	public static void setCurrentArtListaProvider(ArtListaProvider ap) {
		Strand.ap=ap;
	}

	public static int getInt(String s) {
		return s!=null&&s.length()>0?Integer.parseInt(s):0;				
	}

	public static float getFloat(String s) {
		return s!=null&&s.length()>0?Float.parseFloat(s):0;				

	}



}
