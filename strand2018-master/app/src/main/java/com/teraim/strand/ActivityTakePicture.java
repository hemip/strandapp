package com.teraim.strand;

import java.util.HashMap;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.location.LocationProvider;
import android.os.Bundle;
import android.provider.SyncStateContract;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.util.Log;
import android.view.View;
import android.view.View.OnClickListener;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.TextView;

import com.teraim.strand.utils.Constants;
import com.teraim.strand.utils.ImageHandler;

public class ActivityTakePicture extends M_Activity implements LocationListener {

	ImageButton slut,sup,upp,ut,left,right;
	Button gpsB,vidare;
	TextView gpsT,startP_text;
	//convenience..
	//pictures stored as: /strand/bilder/pyID_NAME
	//Map name to button
	HashMap<String, ImageButton> buttonM = new HashMap<String,ImageButton>();
	private LocationManager lm;
	
	private ImageHandler imgHandler;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		// TODO Auto-generated method stub
		super.onCreate(savedInstanceState);
		this.setContentView(R.layout.activity_take_picture);

		vidare = (Button)this.findViewById(R.id.vidare_take_pic);
		gpsB = (Button)this.findViewById(R.id.gpsButton);
		gpsT = (TextView)this.findViewById(R.id.gpsText);
		startP_text = (TextView)this.findViewById(R.id.startP_text);

		gpsT.setVisibility(View.VISIBLE);
		gpsB.setVisibility(View.GONE);


		slut = (ImageButton)this.findViewById(R.id.pic_slut);
		sup = (ImageButton)this.findViewById(R.id.pic_sup);
		upp= (ImageButton)this.findViewById(R.id.pic_upp);
		ut = (ImageButton)this.findViewById(R.id.pic_ut);
		left= (ImageButton)this.findViewById(R.id.pic_left);
		right = (ImageButton)this.findViewById(R.id.pic_right);		
		buttonM.clear();

		//Init pic handler
		imgHandler = new ImageHandler(this);
		
		//Init geoupdate
		lm = (LocationManager)getSystemService(Context.LOCATION_SERVICE);



		//Create buttons.
		initPic(slut,"slut");
		initPic(sup,"sup");
		initPic(upp,"upp");
		initPic(ut,"ut");
		initPic(left,"left");
		initPic(right,"right");


		

		if (lm==null) {
			Log.e("Strand","Startup of GPS tracking failed in ProvYtaGeoUpdater");
		}

		final Intent i = new Intent(this, ActivityZoneSplit.class);

		final EditText riktning = (EditText)this.findViewById(R.id.riktning);
		vidare.setOnClickListener(new OnClickListener() {
			@Override
			public void onClick(View v) {
				py.setRiktning(riktning.getText().toString());
				startActivity(i);
			}});

		riktning.setText(py.getRiktning());
		
	}

	@Override
	public void onPause() {
		super.onPause();
		lm.removeUpdates(this);
	}

	@Override
	public void onResume() {
		super.onResume();

		// Kolla om vi har rätt tillstånd och be om tillstånd om det behövs
		if(ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)!= PackageManager.PERMISSION_GRANTED) {
			this.requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, Constants.MY_PERMISSIONS_REQUEST_ACCESS_FINE			);
		}
		else{
			lm.requestLocationUpdates(
					LocationManager.GPS_PROVIDER,
					0,
					0,
					this);
		}

	}
	/**
	 * 
	 * 1. set image for each button
	 * 2. add click listener.
	 */
	private void initPic(final ImageButton b, final String name) {
		buttonM.put(name, b);
		imgHandler.drawButton(b,name);
		imgHandler.addListener(b,name);
	}



	@Override
	protected void onActivityResult(int requestCode, int resultCode, Intent myI){

		if (requestCode == ImageHandler.TAKE_PICTURE){
			if (resultCode == Activity.RESULT_OK) 
			{
				Log.d("Strand","picture was taken, result ok");
				//				String name = myI.getStringExtra(Strand.KEY_PIC_NAME);
				String currSaving = imgHandler.getCurrentlySaving();
				if (currSaving!=null) {
					ImageButton b = buttonM.get(currSaving);
					imgHandler.drawButton(b,currSaving);
					Log.d("Strand","Drew button!");
				} else
					Log.e("Strand","Did not find pic with name "+currSaving+" in onActRes in TakePic Activity");
			} else {
				Log.d("Strand","picture was NOT taken, result NOT ok");
			}

		}
		
	}

	double[] cords = null;

	@Override
	public void onLocationChanged(Location location) {
		//If no startpunkt set, update button
		if (!set) {
			cords = Geomatte.convertToSweRef(location.getLatitude(),location.getLongitude());
			if (gpsT.isShown()) {
				gpsT.setVisibility(View.GONE);
				gpsB.setVisibility(View.VISIBLE);
			}

			gpsB.setText("Sätt startpunkt\n(N: "+cords[0]+" \nÖ: "+cords[1]+")");
		}
	}
	//Flag set if startpunkt set.
	boolean set = false;

	public void setStartPoint(View v) {	
		
		if (set == true) {
			set = false;
			startP_text.setVisibility(View.GONE);
			gpsB.setVisibility(View.GONE);
			gpsT.setVisibility(View.VISIBLE);
			gpsT.setText("Ett ögonblick..");

		}
		else {
			if(cords!=null) {
				py.setStartPNorth(cords[0]);
				py.setStartPEast(cords[1]);	
				gpsB.setText("Sätt ny startpunkt");
				startP_text.setText("Startpunkt satt till:\nN: "+cords[0]+" Ö: "+cords[1]);
				startP_text.setVisibility(View.VISIBLE);
				gpsT.setVisibility(View.GONE);
				set=true;

			} else {
				startP_text.setText("! Inget värde !");
			}
		}
	}

	@Override
	public void onProviderDisabled(String provider) {
		gpsB.setVisibility(View.GONE);
		gpsT.setVisibility(View.VISIBLE);
		gpsT.setText("GPS avslagen..");
	}
	@Override
	public void onProviderEnabled(String arg0) {
		//ska vara tomt
	}
	@Override
	public void onStatusChanged(String provider, int status, Bundle arg2) {
		if (status == LocationProvider.AVAILABLE) {

		} else if (status == LocationProvider.TEMPORARILY_UNAVAILABLE) {
			gpsB.setVisibility(View.GONE);
			gpsT.setVisibility(View.VISIBLE);
			gpsT.setText("Ett ögonblick..");


		} else if (status == LocationProvider.OUT_OF_SERVICE) {
			gpsB.setVisibility(View.GONE);
			gpsT.setVisibility(View.VISIBLE);
			gpsT.setText("Förlorade GPS..");

		}

	}
	
	
}
